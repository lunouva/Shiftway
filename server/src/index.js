import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import nodemailer from "nodemailer";
import twilio from "twilio";
import webpush from "web-push";
import pool, { query } from "./db.js";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret") {
    throw new Error("Missing JWT_SECRET (or using insecure default). Set JWT_SECRET in server/.env.");
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "dev-session") {
    throw new Error("Missing SESSION_SECRET (or using insecure default). Set SESSION_SECRET in server/.env.");
  }
} else {
  if (!process.env.JWT_SECRET) console.warn("[shiftway-server] JWT_SECRET not set; using dev default");
  if (!process.env.SESSION_SECRET) console.warn("[shiftway-server] SESSION_SECRET not set; using dev default");
}

const app = express();
const PORT = process.env.PORT || 4000;
const APP_URL = process.env.APP_URL || "http://localhost:5173";

const normalizeOrigin = (value) => {
  const v = String(value || "").trim();
  if (!v) return "";
  try {
    return new URL(v).origin.toLowerCase();
  } catch {
    return v.replace(/\/$/, "").toLowerCase();
  }
};

const APP_ALLOWED_ORIGINS = new Set(
  [
    APP_URL,
    ...(process.env.APP_ALLOWED_ORIGINS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
);

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session";

// Express 4 does not natively forward rejected promises from async handlers.
// Wrap route handlers so async throw/rejections are consistently surfaced.
const wrapAsync = (handler) => {
  if (typeof handler !== "function") return handler;
  if (handler.length === 4) return handler; // keep error middleware untouched
  return (req, res, next) => {
    try {
      const out = handler(req, res, next);
      if (out && typeof out.then === "function") out.catch(next);
    } catch (err) {
      next(err);
    }
  };
};

for (const method of ["get", "post", "put", "patch", "delete"]) {
  const original = app[method].bind(app);
  app[method] = (path, ...handlers) => original(path, ...handlers.map(wrapAsync));
}

app.use(cors({
  origin: isProd
    ? (origin, cb) => {
        // Allow non-browser requests (no Origin header) and explicitly configured web origins.
        if (!origin) return cb(null, true);
        const normalizedOrigin = normalizeOrigin(origin);
        if (APP_ALLOWED_ORIGINS.has(normalizedOrigin)) return cb(null, true);
        return cb(new Error("origin_not_allowed"));
      }
    : true,
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  const requestId = incoming || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

if (isProd) {
  // Needed for secure cookies behind typical reverse proxies (Render/Fly/Heroku/Nginx).
  // Allow override for multi-hop proxy setups (e.g., Cloudflare -> Render).
  app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));
}

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: "lax",
    secure: isProd,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `${APP_URL}/api/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error("No email from Google"));
      const existing = await query("SELECT * FROM users WHERE email = $1", [email]);
      if (existing.rows[0]) return done(null, existing.rows[0]);
      const org = await query("INSERT INTO orgs (name) VALUES ($1) RETURNING *", ["New Company"]);
      const location = await query("INSERT INTO locations (org_id, name) VALUES ($1, $2) RETURNING *", [org.rows[0].id, "Main Location"]);
      const user = await query(
        "INSERT INTO users (org_id, location_id, full_name, email, role, is_active) VALUES ($1,$2,$3,$4,$5,true) RETURNING *",
        [org.rows[0].id, location.rows[0].id, profile.displayName || "Owner", email, "owner"]
      );
      await ensureOrgState(org.rows[0].id, location.rows[0].id, user.rows[0]);
      done(null, user.rows[0]);
    } catch (err) {
      done(err);
    }
  }));
}

const signToken = (user) => jwt.sign({ userId: user.id, orgId: user.org_id }, JWT_SECRET, { expiresIn: "7d" });

const auth = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userRes = await query("SELECT * FROM users WHERE id = $1", [payload.userId]);
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: "invalid_user" });
    req.user = user;
    next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "token_expired" });
    }
    res.status(401).json({ error: "invalid_token" });
  }
};

const defaultFlags = () => ({
  unavailabilityEnabled: true,
  employeeEditUnavailability: true,
  showTimeOffOnSchedule: true,
  newsfeedEnabled: true,
  employeesCanPostToFeed: false,
  tasksEnabled: true,
  messagesEnabled: true,
  swapsEnabled: true,
  weekStartsOn: 1,
});

const seedState = ({ locationId, ownerUser }) => ({
  locations: [{ id: locationId, name: "Main Location" }],
  positions: [
    { id: crypto.randomUUID(), location_id: locationId, name: "Shift Lead" },
    { id: crypto.randomUUID(), location_id: locationId, name: "Manager" },
    { id: crypto.randomUUID(), location_id: locationId, name: "Staff" },
  ],
  users: [
    {
      id: ownerUser.id,
      location_id: locationId,
      full_name: ownerUser.full_name,
      email: ownerUser.email,
      role: ownerUser.role,
      is_active: true,
      phone: "",
      birthday: "",
      pronouns: "",
      emergency_contact: { name: "", phone: "" },
      attachments: [],
      notes: "",
    },
  ],
  schedules: [],
  time_off_requests: [],
  unavailability: [],
  news_posts: [],
  tasks: [],
  task_templates: [],
  messages: [],
  shift_swaps: [],
  notification_settings: { email: true, sms: false, push: false },
  feature_flags: defaultFlags(),
});

const ensureOrgState = async (orgId, locationId, ownerUser) => {
  const stateRes = await query("SELECT data FROM org_state WHERE org_id = $1", [orgId]);
  if (stateRes.rows[0]) return stateRes.rows[0].data;
  const data = seedState({ locationId, ownerUser });
  await query("INSERT INTO org_state (org_id, data) VALUES ($1, $2)", [orgId, data]);
  return data;
};

const mailer = (() => {
  if (!process.env.SMTP_URL) return null;
  return nodemailer.createTransport(process.env.SMTP_URL);
})();

const smsClient = (() => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
})();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@shiftway.local",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const sendEmail = async ({ to, subject, text }) => {
  if (!mailer || !process.env.EMAIL_FROM) return false;
  await mailer.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
  return true;
};

const sendSms = async ({ to, body }) => {
  if (!smsClient || !process.env.TWILIO_FROM) return false;
  await smsClient.messages.create({ to, from: process.env.TWILIO_FROM, body });
  return true;
};

const sendPush = async ({ subscriptions, title, body }) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  const payload = JSON.stringify({ title, body, url: APP_URL });
  await Promise.all(subscriptions.map((sub) => webpush.sendNotification(sub, payload).catch(() => null)));
  return true;
};

const emptyOrgState = () => ({
  locations: [],
  positions: [],
  users: [],
  schedules: [],
  time_off_requests: [],
  unavailability: [],
  news_posts: [],
  tasks: [],
  task_templates: [],
  messages: [],
  shift_swaps: [],
  notification_settings: { email: true, sms: false, push: false },
  feature_flags: defaultFlags(),
});

const getInviteByToken = async (token, { includeOrgName = false } = {}) => {
  if (!token) return null;
  const select = [
    "i.id",
    "i.org_id",
    "i.token",
    "i.email",
    "i.phone",
    "i.full_name",
    "i.role",
    "i.location_id",
    "i.invited_by",
    "i.expires_at",
    "i.accepted_at",
    "i.created_at",
    includeOrgName ? "o.name AS org_name" : null,
  ].filter(Boolean).join(", ");
  const from = includeOrgName ? "invites i JOIN orgs o ON o.id = i.org_id" : "invites i";
  const inviteRes = await query(`SELECT ${select} FROM ${from} WHERE i.token = $1`, [token]);
  const invite = inviteRes.rows[0];
  if (!invite) return null;
  if (invite.accepted_at) return { error: "invalid_invite" };
  if (new Date(invite.expires_at) < new Date()) return { error: "invalid_invite" };
  return invite;
};

app.get("/api/health", async (req, res) => {
  const diagnostics = { env: process.env.NODE_ENV || "development", timestamp: new Date().toISOString() };
  try {
    await query("SELECT 1 as ok");
    res.json({ ok: true, db: true, ...diagnostics });
  } catch (err) {
    const msg = String(err?.message || "");
    const error = msg.includes("Missing DATABASE_URL") ? "db_not_configured" : "db_unreachable";
    res.status(503).json({ ok: false, db: false, error, ...diagnostics });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { company_name, full_name, email, password } = req.body || {};
  if (!full_name || !email || !password) return res.status(400).json({ error: "missing_fields" });
  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows[0]) return res.status(400).json({ error: "email_in_use" });
  const org = await query("INSERT INTO orgs (name) VALUES ($1) RETURNING *", [company_name || "New Company"]);
  const location = await query("INSERT INTO locations (org_id, name) VALUES ($1, $2) RETURNING *", [org.rows[0].id, "Main Location"]);
  const hash = await bcrypt.hash(password, 10);
  const userRes = await query(
    "INSERT INTO users (org_id, location_id, full_name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *",
    [org.rows[0].id, location.rows[0].id, full_name, email.toLowerCase(), hash, "owner"]
  );
  const user = userRes.rows[0];
  const data = await ensureOrgState(org.rows[0].id, location.rows[0].id, user);
  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user), data });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });
  const userRes = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  const user = userRes.rows[0];
  if (!user || !user.password_hash) return res.status(400).json({ error: "invalid_credentials" });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ error: "invalid_credentials" });
  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

app.post("/api/auth/magic/request", async (req, res) => {
  const { email, redirect_url } = req.body || {};
  if (!email) return res.status(400).json({ error: "missing_email" });
  const userRes = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  const user = userRes.rows[0];
  if (!user) return res.json({ ok: true });
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  await query("INSERT INTO magic_links (user_id, token, expires_at) VALUES ($1,$2,$3)", [user.id, token, expires]);
  const url = `${APP_URL}/api/auth/magic/verify?token=${token}&redirect=${encodeURIComponent(redirect_url || APP_URL)}`;
  await sendEmail({ to: email, subject: "Your Shiftway login link", text: `Click to sign in: ${url}` });
  res.json({ ok: true });
});

app.get("/api/auth/magic/verify", async (req, res) => {
  const { token, redirect } = req.query;
  if (!token) return res.status(400).send("Missing token");
  const linkRes = await query("SELECT * FROM magic_links WHERE token = $1", [token]);
  const link = linkRes.rows[0];
  if (!link || link.used_at || new Date(link.expires_at) < new Date()) return res.status(400).send("Invalid token");
  await query("UPDATE magic_links SET used_at = now() WHERE id = $1", [link.id]);
  const userRes = await query("SELECT * FROM users WHERE id = $1", [link.user_id]);
  const user = userRes.rows[0];
  const jwtToken = signToken(user);
  const redirectUrl = (redirect || APP_URL).toString();
  const sep = redirectUrl.includes("?") ? "&" : "?";
  res.redirect(`${redirectUrl}${sep}token=${jwtToken}`);
});

app.post("/api/auth/magic/verify", async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "missing_token" });
  const linkRes = await query("SELECT * FROM magic_links WHERE token = $1", [token]);
  const link = linkRes.rows[0];
  if (!link || link.used_at || new Date(link.expires_at) < new Date()) return res.status(400).json({ error: "invalid_token" });
  await query("UPDATE magic_links SET used_at = now() WHERE id = $1", [link.id]);
  const userRes = await query("SELECT * FROM users WHERE id = $1", [link.user_id]);
  const user = userRes.rows[0];
  const jwtToken = signToken(user);
  res.json({ token: jwtToken, user: sanitizeUser(user) });
});

app.get("/api/auth/google", (req, res, next) => {
  const redirect = req.query.redirect || APP_URL;
  const state = encodeURIComponent(String(redirect));
  if (!passport._strategy("google")) return res.status(400).send("Google OAuth not configured");
  passport.authenticate("google", { scope: ["profile", "email"], state })(req, res, next);
});

app.get("/api/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", { failureRedirect: APP_URL })(req, res, () => {
    const user = req.user;
    const token = signToken(user);
    const redirect = req.query.state ? decodeURIComponent(req.query.state) : APP_URL;
    const sep = redirect.includes("?") ? "&" : "?";
    res.redirect(`${redirect}${sep}token=${token}`);
  });
});

app.get("/api/me", auth, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get("/api/state", auth, async (req, res) => {
  const stateRes = await query("SELECT data FROM org_state WHERE org_id = $1", [req.user.org_id]);
  if (!stateRes.rows[0]) {
    const data = await ensureOrgState(req.user.org_id, req.user.location_id, req.user);
    return res.json({ data });
  }
  res.json({ data: stateRes.rows[0].data });
});

app.post("/api/state", auth, async (req, res) => {
  const { data } = req.body || {};
  if (!data) return res.status(400).json({ error: "missing_data" });
  const cleaned = { ...data };
  if (Array.isArray(cleaned.users)) {
    cleaned.users = cleaned.users.map((u) => ({ ...u, password: undefined }));
  }
  await query("INSERT INTO org_state (org_id, data, updated_at) VALUES ($1,$2,now()) ON CONFLICT (org_id) DO UPDATE SET data = $2, updated_at = now()", [req.user.org_id, cleaned]);
  res.json({ ok: true });
});

app.post("/api/users", auth, async (req, res) => {
  const { full_name, email, role, location_id, password } = req.body || {};
  if (!full_name || !email) return res.status(400).json({ error: "missing_fields" });
  const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  if (existing.rows[0]) return res.status(400).json({ error: "email_in_use" });
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const userRes = await query(
    "INSERT INTO users (org_id, location_id, full_name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *",
    [req.user.org_id, location_id || req.user.location_id, full_name, email.toLowerCase(), hash, role || "employee"]
  );
  res.json({ user: sanitizeUser(userRes.rows[0]) });
});

app.get("/api/push/public-key", auth, async (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

app.post("/api/push/subscribe", auth, async (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription) return res.status(400).json({ error: "missing_subscription" });
  const { endpoint, keys } = subscription;
  await query(
    "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, endpoint) DO NOTHING",
    [req.user.id, endpoint, keys?.p256dh || "", keys?.auth || ""]
  );
  res.json({ ok: true });
});

app.post("/api/notify", auth, async (req, res) => {
  const { user_ids, title, body, channels } = req.body || {};
  if (!Array.isArray(user_ids) || user_ids.length === 0) return res.status(400).json({ error: "missing_recipients" });
  const usersRes = await query("SELECT id, email FROM users WHERE id = ANY($1)", [user_ids]);
  const stateRes = await query("SELECT data FROM org_state WHERE org_id = $1", [req.user.org_id]);
  const stateUsers = stateRes.rows[0]?.data?.users || [];
  const userById = Object.fromEntries(stateUsers.map((u) => [u.id, u]));
  const emailEnabled = channels?.email !== false;
  const smsEnabled = !!channels?.sms;
  const pushEnabled = !!channels?.push;

  if (emailEnabled) {
    await Promise.all(usersRes.rows.map((u) => sendEmail({ to: u.email, subject: title, text: body })));
  }
  if (smsEnabled) {
    await Promise.all(usersRes.rows.map((u) => {
      const phone = userById[u.id]?.phone;
      if (!phone) return null;
      return sendSms({ to: phone, body: `${title}\n${body}` });
    }));
  }
  if (pushEnabled) {
    const subsRes = await query("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)", [user_ids]);
    const subs = subsRes.rows.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }));
    await sendPush({ subscriptions: subs, title, body });
  }
  res.json({ ok: true });
});

app.post("/api/invite", auth, async (req, res) => {
  if (!["manager", "owner"].includes(req.user.role)) return res.status(403).json({ error: "forbidden" });

  const { full_name, email, phone, role, location_id } = req.body || {};
  const trimmedName = String(full_name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const trimmedPhone = String(phone || "").trim();
  const inviteRole = String(role || "employee").trim().toLowerCase();

  if (!trimmedName || (!normalizedEmail && !trimmedPhone)) {
    return res.status(400).json({ error: "missing_fields" });
  }
  if (!["employee", "manager"].includes(inviteRole)) {
    return res.status(400).json({ error: "forbidden" });
  }

  let nextLocationId = location_id || null;
  if (nextLocationId) {
    const locationRes = await query("SELECT id FROM locations WHERE id = $1 AND org_id = $2", [nextLocationId, req.user.org_id]);
    if (!locationRes.rows[0]) return res.status(404).json({ error: "not_found" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const inviteRes = await query(
    "INSERT INTO invites (org_id, token, email, phone, full_name, role, location_id, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [req.user.org_id, token, normalizedEmail || null, trimmedPhone || null, trimmedName, inviteRole, nextLocationId, req.user.id, expiresAt]
  );

  const inviteUrl = `${APP_URL}/invite/accept?token=${token}`;
  const message = `You have been invited to Shiftway. Accept your invite here: ${inviteUrl}`;

  if (normalizedEmail) {
    await sendEmail({
      to: normalizedEmail,
      subject: "You have been invited to Shiftway",
      text: message,
    });
  }
  if (trimmedPhone && smsClient) {
    await sendSms({ to: trimmedPhone, body: message });
  }

  res.json({ ok: true, invite_id: inviteRes.rows[0].id, invite_url: inviteUrl });
});

app.get("/api/invite/verify", async (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).json({ error: "missing_token" });

  const invite = await getInviteByToken(token, { includeOrgName: true });
  if (!invite || invite.error) return res.status(400).json({ error: "invalid_invite" });

  res.json({
    ok: true,
    full_name: invite.full_name,
    email: invite.email,
    role: invite.role,
    org_name: invite.org_name,
  });
});

app.post("/api/invite/accept", async (req, res) => {
  const { token, password, full_name } = req.body || {};
  const inviteToken = String(token || "").trim();
  const trimmedName = String(full_name || "").trim();
  const rawPassword = String(password || "");

  if (!inviteToken) return res.status(400).json({ error: "missing_token" });
  if (!trimmedName || !rawPassword) return res.status(400).json({ error: "missing_fields" });

  const invite = await getInviteByToken(inviteToken);
  if (!invite || invite.error) return res.status(400).json({ error: "invalid_invite" });

  const passwordHash = await bcrypt.hash(rawPassword, 10);
  const fallbackEmail = `invite+${invite.id}@phone.shiftway.local`;
  const userEmail = String(invite.email || fallbackEmail).toLowerCase();

  const client = pool ? await pool.connect() : null;
  if (!client) {
    throw new Error(
      "Missing DATABASE_URL. Create server/.env from server/.env.example and set DATABASE_URL (Postgres connection string)."
    );
  }

  try {
    await client.query("BEGIN");

    const existingUserRes = await client.query("SELECT id FROM users WHERE email = $1", [userEmail]);
    if (existingUserRes.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "email_in_use" });
    }

    const userRes = await client.query(
      "INSERT INTO users (org_id, location_id, full_name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *",
      [invite.org_id, invite.location_id, trimmedName, userEmail, passwordHash, invite.role]
    );
    const user = userRes.rows[0];

    await client.query("UPDATE invites SET accepted_at = now() WHERE id = $1", [invite.id]);

    const stateRes = await client.query("SELECT data FROM org_state WHERE org_id = $1", [invite.org_id]);
    const state = stateRes.rows[0]?.data || emptyOrgState();
    const nextUsers = Array.isArray(state.users) ? [...state.users] : [];
    nextUsers.push({
      id: user.id,
      location_id: user.location_id,
      full_name: user.full_name,
      email: invite.email || "",
      role: user.role,
      is_active: user.is_active,
      phone: invite.phone || "",
      birthday: "",
      pronouns: "",
      emergency_contact: { name: "", phone: "" },
      attachments: [],
      notes: "",
    });
    const nextState = { ...emptyOrgState(), ...state, users: nextUsers };

    await client.query(
      "INSERT INTO org_state (org_id, data, updated_at) VALUES ($1,$2,now()) ON CONFLICT (org_id) DO UPDATE SET data = $2, updated_at = now()",
      [invite.org_id, nextState]
    );

    await client.query("COMMIT");

    res.json({ token: signToken(user), user: sanitizeUser(user) });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors after failure
    }
    throw err;
  } finally {
    client.release();
  }
});

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

app.use((err, req, res, next) => {
  console.error("[shiftway-server] Unhandled route error", err);
  if (res.headersSent) return next(err);

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "invalid_json",
      message: "Request body contains invalid JSON.",
      requestId: req.requestId,
    });
  }

  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: "payload_too_large",
      message: "Request payload is too large.",
      requestId: req.requestId,
    });
  }

  if (err?.message === "origin_not_allowed") {
    return res.status(403).json({ error: "forbidden", message: "Request origin is not allowed by CORS.", requestId: req.requestId });
  }

  // Surface infrastructure failures with stable, client-friendly codes.
  // This keeps Live mode actionable when the API is up but DB wiring is not.
  const rawMessage = String(err?.message || "");
  const dbConfigMissing = rawMessage.includes("Missing DATABASE_URL");
  const dbUnreachable = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH"].includes(err?.code) || rawMessage.includes("connect ECONNREFUSED") || rawMessage.includes("connect ETIMEDOUT") || rawMessage.includes("getaddrinfo ENOTFOUND") || rawMessage.includes("timeout expired");

  if (dbConfigMissing) {
    return res.status(503).json({
      error: "db_not_configured",
      message: "Database is not configured on the backend.",
      requestId: req.requestId,
    });
  }

  if (dbUnreachable) {
    return res.status(503).json({
      error: "db_unreachable",
      message: "Database is unreachable from the backend.",
      requestId: req.requestId,
    });
  }

  const message = isProd ? "Internal server error" : (err?.message || "Internal server error");
  res.status(500).json({ error: "internal_error", message, requestId: req.requestId });
});

app.listen(PORT, () => {
  const allowedOrigins = Array.from(APP_ALLOWED_ORIGINS.values());
  console.log(`Shiftway server listening on ${PORT}`);
  if (isProd) {
    console.log(`[shiftway-server] Allowed CORS origins: ${allowedOrigins.join(", ") || "(none configured)"}`);
  }
});
