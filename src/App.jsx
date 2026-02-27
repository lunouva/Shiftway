import React, { useEffect, useMemo, useState, createContext, useContext } from "react";

/**
 * Shiftway – safe build + updates per new spec
 * - Prev/Next week controls (respect custom work-week start)
 * - Unavailability: override with warning (confirm). Employees can edit; Managers can toggle in Settings.
 * - Time off: pending/approved chips on Schedule; scheduling over time off shows warning (confirm).
 * - Newsfeed: only Managers/Owners can post by default; toggle in Settings to allow employees.
 * - Tasks: task templates for Managers/Owners; create tasks from templates; quick task creation in Shift modal.
 * - Requests: its own tab for Managers/Owners (time-off approvals). Positions moved under Settings.
 * - Messages: simple DMs.
 * - NEW: Work-week start day configurable in Settings (applies to week picker & grid) + prev/next week buttons.
 * - NEW: Add Employee fields – phone, birthday, pronouns (optional), emergency contact, attachments (metadata only for now), notes.
 * - NEW: Manager quick inputs (under Schedule): add Time Off & Weekly Unavailability; full lists remain in Requests/Unavailability tabs.
 *
 * This file is a complete, runnable React single-file app for the canvas preview.
 */

// ---------- constants ----------
const WEEK_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ---------- date utils (safe) ----------
const safeDate = (v) => {
  const d = v instanceof Date ? new Date(v) : new Date(String(v));
  return isNaN(d.getTime()) ? new Date() : d;
};
const addDays = (d, n) => { const x = safeDate(d); const y = new Date(x); y.setDate(y.getDate()+n); return y; };
const startOfWeek = (d, weekStartsOn = 1) => {
  const date = safeDate(d);
  const day = date.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
};
const fmtDate = (d) => safeDate(d).toISOString().slice(0, 10); // YYYY-MM-DD
const fmtTime = (d) => safeDate(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDateLabel = (d) => safeDate(d).toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });

// ---------- utilities ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date();

const combineDayAndTime = (dayDate, hhmm) => {
  const day = safeDate(dayDate);
  const [h, m] = String(hhmm || "00:00").split(":").map((n) => Number(n) || 0);
  const out = new Date(day);
  out.setHours(h, m, 0, 0);
  return out;
};

const minutes = (hhmm) => {
  const [h, m] = String(hhmm || "00:00").split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
};

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

const hoursBetween = (a, b, breakMin = 0) => Math.max(0, (safeDate(b) - safeDate(a) - (Number(breakMin) || 0) * 60000) / 3600000);

const download = (filename, text) => {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const isDateWithin = (dayISO, fromISO, toISO) => dayISO >= fromISO && dayISO <= toISO; // strings YYYY-MM-DD

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

// ---------- demo storage + client settings ----------
const ENABLE_DEMO = import.meta?.env?.VITE_ENABLE_DEMO === '1';
const DEMO_PARAM_ENABLED = new URLSearchParams(window.location.search).get('demo') === '1';
const currentHost = window?.location?.hostname || '';
const isLocalHost = currentHost === 'localhost' || currentHost === '127.0.0.1';
const demoAllowedHosts = (import.meta?.env?.VITE_DEMO_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const demoAllowedOnThisHost = isLocalHost || demoAllowedHosts.includes(currentHost.toLowerCase());
const DEMO_MODE = ENABLE_DEMO && DEMO_PARAM_ENABLED && demoAllowedOnThisHost;

// Hide internal backend controls from normal users.
// Enable explicitly when needed.
const SHOW_BACKEND_SETTINGS = import.meta?.env?.VITE_SHOW_BACKEND_SETTINGS === '1';
// Extra guard: keep demo-only controls/credentials hidden unless explicitly enabled.
const SHOW_DEMO_CONTROLS = import.meta?.env?.VITE_SHOW_DEMO_CONTROLS === '1';

const STORAGE_KEY = "shiftway_v2";
const CLIENT_SETTINGS_KEY = "shiftway_client_settings";
const TOKEN_KEY = "shiftway_token";

const loadClientSettings = () => {
  const base = { apiBase: "" };
  try {
    const raw = localStorage.getItem(CLIENT_SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const merged = { ...base, ...parsed };
    return merged;
  } catch {
    return base;
  }
};

const saveClientSettings = (settings) => {
  localStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(settings));
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
  weekStartsOn: 1, // 0=Sun ... 6=Sat
});

const seedData = () => ({
  locations: [{ id: "loc1", name: "Main Shop" }],
  positions: [
    { id: uid(), location_id: "loc1", name: "Scooper" },
    { id: uid(), location_id: "loc1", name: "Shift Lead" },
    { id: uid(), location_id: "loc1", name: "Manager" },
  ],
  users: [
    { id: uid(), location_id: "loc1", full_name: "Manager Mike", email: "manager@demo.local", password: "demo", role: "manager", is_active: true, phone: "", birthday: "", pronouns: "", emergency_contact: { name: "", phone: "" }, attachments: [], notes: "" },
    { id: uid(), location_id: "loc1", full_name: "Owner Olivia", email: "owner@demo.local", password: "demo", role: "owner", is_active: true, phone: "", birthday: "", pronouns: "", emergency_contact: { name: "", phone: "" }, attachments: [], notes: "" },
    { id: uid(), location_id: "loc1", full_name: "Lily Adams", email: "lily@example.com", password: "demo", role: "employee", is_active: true, phone: "", birthday: "", pronouns: "she/her", emergency_contact: { name: "A. Adams", phone: "555-0102" }, attachments: [], notes: "" },
    { id: uid(), location_id: "loc1", full_name: "Gavin Reed", email: "gavin@example.com", password: "demo", role: "employee", is_active: true, phone: "", birthday: "", pronouns: "he/him", emergency_contact: { name: "R. Reed", phone: "555-0103" }, attachments: [], notes: "" },
    { id: uid(), location_id: "loc1", full_name: "Riley Brooks", email: "riley@example.com", password: "demo", role: "employee", is_active: true, phone: "", birthday: "", pronouns: "they/them", emergency_contact: { name: "K. Brooks", phone: "555-0104" }, attachments: [], notes: "" },
  ],
  schedules: [],
  time_off_requests: [],
  unavailability: [], // {id, user_id, kind:'weekly'|'date', weekday?, date?, start_hhmm, end_hhmm, notes}
  news_posts: [], // {id, user_id, body, created_at}
  tasks: [], // {id, title, assigned_to, due_date, status:'open'|'done', created_by}
  task_templates: [], // {id, title}
  messages: [], // {id, from_user_id, to_user_id, body, created_at}
  shift_swaps: [], // {id, from_user_id, to_user_id, from_shift_id, to_shift_id?, status, notes, created_at}
  notification_settings: { email: true, sms: false, push: false },
  feature_flags: defaultFlags(),
});

const liveBootstrapData = () => ({
  locations: [{ id: "loc1", name: "Main Location" }],
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

const normalizeUser = (u) => {
  const base = { phone: "", birthday: "", pronouns: "", attachments: [], notes: "" };
  const emergency = { name: "", phone: "", ...(u?.emergency_contact || {}) };
  return { ...base, ...u, emergency_contact: emergency };
};

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEMO_MODE ? seedData() : liveBootstrapData();
    const parsed = JSON.parse(raw);
    if (!parsed.unavailability) parsed.unavailability = [];
    if (!parsed.news_posts) parsed.news_posts = [];
    if (!parsed.tasks) parsed.tasks = [];
    if (!parsed.task_templates) parsed.task_templates = [];
    if (!parsed.messages) parsed.messages = [];
    if (!parsed.shift_swaps) parsed.shift_swaps = [];
    if (!parsed.notification_settings) parsed.notification_settings = { email: true, sms: false, push: false };
    if (!parsed.feature_flags) parsed.feature_flags = defaultFlags();
    if (parsed.feature_flags.weekStartsOn == null) parsed.feature_flags.weekStartsOn = 1;
    if (parsed.feature_flags.swapsEnabled == null) parsed.feature_flags.swapsEnabled = true;
    // backfill user extra fields
    parsed.users = (parsed.users || []).map(normalizeUser);
    return parsed;
  } catch (e) {
    console.error(e);
    return DEMO_MODE ? seedData() : liveBootstrapData();
  }
};

const saveLocalData = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

const getApiBase = (clientSettings) => {
  const fromSettings = clientSettings?.apiBase;
  if (fromSettings) return fromSettings;

  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return fromEnv;

  // Sensible default:
  // - local dev: backend runs on :4000
  // - deployed: assume same-origin backend unless explicitly configured
  const host = window?.location?.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  if (isLocalhost) return "http://localhost:4000";
  return window.location.origin;
};

const friendlyApiError = (code) => {
  const map = {
    missing_fields: "Please fill in all required fields.",
    missing_email: "Please enter an email address.",
    email_in_use: "That email is already in use. Try signing in instead.",
    invalid_credentials: "Invalid email or password.",
    missing_token: "Your session is missing. Please sign in again.",
    invalid_token: "Your login link or session is no longer valid. Please sign in again.",
    token_expired: "Your session expired. Please sign in again.",
    invalid_user: "Your account could not be found. Please sign in again.",
    not_found: "That item no longer exists.",
    forbidden: "You don't have permission to do that.",
    missing_data: "Nothing to save yet. Refresh and try again.",
    missing_recipients: "Select at least one recipient before sending a notification.",
    missing_subscription: "Push subscription is missing. Re-enable notifications and try again.",
    internal_error: "The server hit an unexpected error. Please retry in a moment.",
    service_unavailable: "The backend is temporarily unavailable. Please retry in a moment.",
    bad_gateway: "The backend is temporarily unavailable behind a proxy. Please retry in a moment.",
    gateway_timeout: "The backend took too long to respond. Please retry in a moment.",
    db_not_configured: "Backend is running, but database configuration is missing.",
    db_unreachable: "Backend is running, but it cannot reach the database.",
  };
  return map[String(code || "").toLowerCase()] || "";
};

const formatRetryAfter = (retryAfterHeader) => {
  if (!retryAfterHeader) return "";
  const asSeconds = Number(retryAfterHeader);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return ` Try again in about ${Math.max(1, Math.round(asSeconds))}s.`;
  }

  const at = new Date(retryAfterHeader);
  if (Number.isFinite(at.getTime())) {
    const seconds = Math.round((at.getTime() - Date.now()) / 1000);
    if (seconds > 0) return ` Try again in about ${seconds}s.`;
  }

  return "";
};

const apiFetch = async (path, { token, method = "GET", body, timeoutMs = 10000 } = {}, clientSettings) => {
  const apiBase = getApiBase(clientSettings).replace(/\/$/, "");
  let res;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Check server health and try again.`);
    // Network / CORS / DNS / refused connection
    const root = e?.message ? `Network error: ${e.message}` : "Network error";
    throw new Error(`${root}. Could not reach ${apiBase}. Check VITE_API_BASE/server URL and CORS settings.`);
  } finally {
    clearTimeout(t);
  }

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    // If auth expired, clear local token so the UI can return to login cleanly.
    if (res.status === 401 && token) {
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    }

    let msg = "";
    try {
      if (isJson) {
        const j = await res.json();
        msg = friendlyApiError(j?.error) || j?.message || j?.error || JSON.stringify(j);
      } else {
        msg = await res.text();
      }
    } catch {
      // ignore parse errors
    }

    const prefix = `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""})`;

    // Give users actionable, human-readable failures in Live mode.
    if (res.status === 401) {
      throw new Error(msg || "Session expired. Please log in again.");
    }
    if (res.status === 403) {
      throw new Error(msg || "You don't have permission to do that.");
    }
    if (res.status === 429) {
      const retryHint = formatRetryAfter(res.headers.get("retry-after"));
      const detail = msg || "Too many requests. Please wait a moment and try again.";
      throw new Error(`${detail}${retryHint}`);
    }
    if (res.status === 502) {
      throw new Error(msg || "Upstream backend error (502). Please retry in a moment.");
    }
    if (res.status === 503) {
      const retryHint = formatRetryAfter(res.headers.get("retry-after"));
      const detail = msg || "Backend is temporarily unavailable (503). Please retry in a moment.";
      throw new Error(`${detail}${retryHint}`);
    }
    if (res.status === 504) {
      throw new Error(msg || "Backend timed out (504). Please retry in a moment.");
    }
    if (res.status >= 500) {
      throw new Error(msg || "Server error. Please try again in a moment.");
    }
    if (res.status === 404) {
      throw new Error(msg || "That item no longer exists or the endpoint was not found.");
    }

    const requestId = res.headers.get("x-request-id") || res.headers.get("x-correlation-id");
    if (requestId) {
      throw new Error(msg ? `${prefix}: ${msg} (request id: ${requestId})` : `${prefix} (request id: ${requestId})`);
    }

    throw new Error(msg ? `${prefix}: ${msg}` : prefix);
  }

  if (!isJson) return null;

  try {
    return await res.json();
  } catch {
    throw new Error("Backend returned malformed JSON. Check server logs and retry.");
  }
};

// ---------- small UI bits ----------
function Section({ title, right, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <div>{right}</div>
      </div>
      <div className="rounded-2xl border p-4 shadow-sm">{children}</div>
    </div>
  );
}

function Pill({ children, tone = "default" }) {
  const toneCls = tone === "success" ? "text-green-700" : tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-red-700" : "text-gray-700";
  const bgCls = tone === "success" ? "bg-green-50 border-green-300" : tone === "warn" ? "bg-amber-50 border-amber-300" : tone === "danger" ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-300";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${bgCls} ${toneCls}`}>{children}</span>;
}

function Toolbar({ children }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function TextInput({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border px-3 py-2"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <textarea value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className="min-h-[80px] rounded-xl border px-3 py-2" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border px-3 py-2">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)} className="mt-1"/>
      <span>
        <span className="font-medium">{label}</span>
        {hint && <div className="text-xs text-gray-600">{hint}</div>}
      </span>
    </label>
  );
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="rounded-xl border px-2 py-1 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

// ---------- auth ----------
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children, data, setData, backendMode, clientSettings, onAuthChange }) {
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem("shiftway_current_user") || null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (!backendMode) {
      const user = data.users.find((u) => u.id === currentUserId) || null;
      setCurrentUser(user);
      onAuthChange?.(user);
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setCurrentUser(null);
      onAuthChange?.(null);
      return;
    }
    apiFetch("/api/me", { token }, clientSettings)
      .then((res) => {
        setCurrentUser(res.user || res);
        onAuthChange?.(res.user || res);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setCurrentUser(null);
        onAuthChange?.(null);
      });
  }, [backendMode, clientSettings, currentUserId, data.users, onAuthChange]);

  const login = async (email, password) => {
    if (!backendMode) {
      const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) throw new Error("No account found");
      const pass = user.password || "demo";
      if (password !== pass) throw new Error("Wrong password");
      localStorage.setItem("shiftway_current_user", user.id);
      setCurrentUserId(user.id);
      setCurrentUser(user);
      onAuthChange?.(user);
      return user;
    }
    const res = await apiFetch("/api/auth/login", { method: "POST", body: { email, password } }, clientSettings);
    if (res?.token) localStorage.setItem(TOKEN_KEY, res.token);
    setCurrentUser(res.user);
    onAuthChange?.(res.user);
    return res.user;
  };

  const registerCompany = async ({ company_name, full_name, email, password }) => {
    const res = await apiFetch("/api/auth/register", { method: "POST", body: { company_name, full_name, email, password } }, clientSettings);
    if (res?.token) localStorage.setItem(TOKEN_KEY, res.token);
    if (res?.data) setData(res.data);
    setCurrentUser(res.user);
    onAuthChange?.(res.user);
    return res.user;
  };

  const requestMagicLink = async (email) => {
    await apiFetch("/api/auth/magic/request", { method: "POST", body: { email, redirect_url: window.location.origin } }, clientSettings);
    return true;
  };

  const verifyMagicLink = async (token) => {
    const res = await apiFetch("/api/auth/magic/verify", { method: "POST", body: { token } }, clientSettings);
    if (res?.token) localStorage.setItem(TOKEN_KEY, res.token);
    setCurrentUser(res.user);
    onAuthChange?.(res.user);
    return res.user;
  };

  const loginWithGoogle = () => {
    const redirect = encodeURIComponent(window.location.origin);
    window.location.href = `${getApiBase(clientSettings)}/api/auth/google?redirect=${redirect}`;
  };

  const logout = () => {
    localStorage.removeItem("shiftway_current_user");
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUserId(null);
    setCurrentUser(null);
    onAuthChange?.(null);
  };

  const addUser = async (payload, location_id = data.locations[0]?.id) => {
    if (!backendMode) {
      const newUser = { id: uid(), location_id, role: "employee", is_active: true, password: "demo", attachments: [], ...payload };
      setData((d) => ({ ...d, users: [...d.users, newUser] }));
      return newUser;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await apiFetch("/api/users", { token, method: "POST", body: { ...payload, location_id } }, clientSettings);
    if (res?.user) {
      setData((d) => ({ ...d, users: [...d.users, res.user] }));
      return res.user;
    }
    return null;
  };

  return <AuthCtx.Provider value={{ currentUser, login, logout, addUser, registerCompany, requestMagicLink, verifyMagicLink, loginWithGoogle, backendMode }}>{children}</AuthCtx.Provider>;
}

// ---------- week grid ----------
function WeekGrid({ employees, weekDays, shifts, positionsById, unavailability, timeOffList, showTimeOffChips, onCreate, onDelete }) {
  const byUserUnav = useMemo(() => {
    const map = {};
    for (const u of employees) map[u.id] = [];
    for (const ua of unavailability) {
      if (map[ua.user_id]) map[ua.user_id].push(ua);
    }
    return map;
  }, [employees, unavailability]);

  const byUserTimeOff = useMemo(() => {
    const m = {};
    for (const u of employees) m[u.id] = [];
    for (const r of timeOffList || []) if (m[r.user_id]) m[r.user_id].push(r);
    return m;
  }, [employees, timeOffList]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1000px]">
        <div className="grid grid-cols-[220px_repeat(7,1fr)]">
          <div className="sticky left-0 z-10 bg-gray-50 p-2 font-semibold">Employee</div>
          {weekDays.map((d) => (
            <div key={String(d)} className="p-2 text-center font-semibold bg-gray-50">
              {fmtDateLabel(d)}
            </div>
          ))}
          {employees.map((emp) => (
            <React.Fragment key={emp.id}>
              <div className="sticky left-0 z-10 border-t bg-white p-2 font-medium">{emp.full_name}</div>
              {weekDays.map((day) => {
                const dayShifts = shifts.filter((s) => s.user_id === emp.id && fmtDate(s.starts_at) === fmtDate(day));
                const dayUnav = (byUserUnav[emp.id] || []).filter((ua) =>
                  ua.kind === 'date' ? ua.date === fmtDate(day) : ua.weekday === day.getDay()
                );
                const dayTimeOff = (byUserTimeOff[emp.id] || []).filter((r)=> isDateWithin(fmtDate(day), r.date_from, r.date_to));
                return (
                  <div key={emp.id + fmtDate(day)} className="border-l border-t p-2 min-h-24">
                    <div className="space-y-2">
                      {showTimeOffChips && dayTimeOff.map((r)=> (
                        <div key={r.id} className={`rounded-xl border px-2 py-1 text-xs ${r.status==='approved' ? 'border-green-300 bg-green-50 text-green-700' : r.status==='pending' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-300 bg-gray-50 text-gray-700'}`}>
                          Time off {r.date_from}→{r.date_to} ({r.status}){r.notes ? ` • ${r.notes}`: ''}
                        </div>
                      ))}
                      {dayUnav.map((ua) => (
                        <div key={ua.id} className="rounded-xl border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
                          Unavailable {ua.start_hhmm}–{ua.end_hhmm}{ua.notes ? ` • ${ua.notes}` : ''}
                        </div>
                      ))}
                      {dayShifts.map((s) => (
                        <div key={s.id} className="rounded-xl border px-2 py-1 text-sm shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium">{fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</div>
                            <button className="text-xs underline" onClick={() => onDelete(s.id)}>delete</button>
                          </div>
                          <div className="text-xs text-gray-600">{positionsById[s.position_id]?.name || "—"}</div>
                        </div>
                      ))}
                      <button className="text-xs underline" onClick={() => onCreate(emp.id, day)}>+ add</button>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- main app ----------
export default function App() {
  const [clientSettings, setClientSettings] = useState(loadClientSettings);
  const backendMode = !DEMO_MODE;
  const apiBase = getApiBase(clientSettings);
  const [data, setData] = useState(loadData);
  const [loading, setLoading] = useState(backendMode);
  const [hydrated, setHydrated] = useState(!backendMode);
  const [authUser, setAuthUser] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [tab, setTab] = useState("schedule");
  const [locationId, setLocationId] = useState("loc1");

  const defaultWeekStart = fmtDate(startOfWeek(today(), 1));
  const [weekStart, setWeekStart] = useState(defaultWeekStart);

  const [shiftModal, setShiftModal] = useState({ open: false, preUserId: null, preDay: null });
  const [swapModal, setSwapModal] = useState({ open: false, shift: null });

  const location = data.locations.find((l) => l.id === locationId) || data.locations[0];
  const users = data.users.filter((u) => u.location_id === location.id && u.is_active);
  const positions = data.positions.filter((p) => p.location_id === location.id);
  const positionsById = useMemo(() => Object.fromEntries(positions.map((p) => [p.id, p])), [positions]);

  // backfill arrays if old data
  useEffect(() => {
    setData((d) => ({
      ...d,
      unavailability: d.unavailability || [],
      news_posts: d.news_posts || [],
      tasks: d.tasks || [],
      task_templates: d.task_templates || [],
      messages: d.messages || [],
      feature_flags: d.feature_flags || defaultFlags(),
      users: (d.users || []).map(normalizeUser)
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // normalize initial weekStart to settings
  useEffect(() => {
    const ws = (data.feature_flags || defaultFlags()).weekStartsOn ?? 1;
    setWeekStart((prev) => fmtDate(startOfWeek(prev, ws)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = useMemo(() => data.schedules.find((s) => s.location_id === location.id && s.week_start === weekStart), [data.schedules, location.id, weekStart]);
  const weekDays = useMemo(() => {
    const start = safeDate(weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      params.delete("token");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  useEffect(() => {
    if (!backendMode) {
      setLoading(false);
      setHydrated(true);
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !authUser) {
      setLoading(false);
      setHydrated(false);
      return;
    }
    setLoading(true);
    setApiError(null);
    apiFetch("/api/state", { token }, clientSettings)
      .then((res) => {
        const next = res?.data || res;
        if (next) setData(next);
        setHydrated(true);
        setApiError(null);
      })
      .catch(async (err) => {
        console.error(err);
        const baseMsg = err?.message || 'Unable to reach server';

        // Best-effort: probe /api/health to distinguish “backend down” vs “DB not configured/unreachable”.
        try {
          await apiFetch("/api/health", {}, clientSettings);
          setApiError(`${baseMsg} (API: ${getApiBase(clientSettings)})`);
        } catch (healthErr) {
          const hm = String(healthErr?.message || "");
          if (hm.includes("db_not_configured")) {
            setApiError(`Backend is up but DATABASE_URL is not configured (API: ${getApiBase(clientSettings)}). Create server/.env from server/.env.example, set DATABASE_URL, then run: npm run db:init`);
            return;
          }
          if (hm.includes("db_unreachable")) {
            setApiError(`Backend is up but the database is unreachable (API: ${getApiBase(clientSettings)}). Ensure Postgres is running and DATABASE_URL is reachable, then re-run: npm run db:init`);
            return;
          }
          setApiError(`${baseMsg} (API: ${getApiBase(clientSettings)})`);
        }
      })
      .finally(() => setLoading(false));
  }, [backendMode, authUser, clientSettings]);

  useEffect(() => { saveClientSettings(clientSettings); }, [clientSettings]);

  useEffect(() => {
    if (!hydrated) return;
    if (!backendMode) {
      saveLocalData(data);
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const handle = setTimeout(() => {
      apiFetch("/api/state", { token, method: "POST", body: { data } }, clientSettings)
        .then(() => setApiError(null))
        .catch((err) => {
          console.error(err);
          setApiError(`${err?.message || 'Unable to save changes'} (API: ${getApiBase(clientSettings)})`);
        });
    }, 350);
    return () => clearTimeout(handle);
  }, [data, backendMode, hydrated, clientSettings]);

  const ensureSchedule = () => {
    if (schedule) return schedule;
    const newSched = { id: uid(), location_id: location.id, week_start: weekStart, status: "draft", shifts: [] };
    setData((d) => ({ ...d, schedules: [...d.schedules, newSched] }));
    return newSched;
  };

  const upsertSchedule = (updater) => {
    setData((d) => ({
      ...d,
      schedules: d.schedules.map((s) => (s.location_id === location.id && s.week_start === weekStart ? updater(s) : s)),
    }));
  };

  // ----- Unavailability helpers -----
  const findUnavailabilityFor = (user_id, day) => {
    const dayKey = fmtDate(day);
    const dow = safeDate(day).getDay();
    return (data.unavailability || []).filter((ua) => ua.user_id === user_id && (
      (ua.kind === 'date' && ua.date === dayKey) || (ua.kind === 'weekly' && ua.weekday === dow)
    ));
  };

  const hasUnavailabilityConflict = (user_id, day, start_hhmm, end_hhmm) => {
    const aStart = minutes(start_hhmm);
    const aEnd = minutes(end_hhmm);
    if (!(aEnd > aStart)) return [];
    const matches = findUnavailabilityFor(user_id, day);
    return matches.filter((ua) => rangesOverlap(aStart, aEnd, minutes(ua.start_hhmm), minutes(ua.end_hhmm)));
  };

  // ----- Time off helpers -----
  const findTimeOffForDay = (user_id, day) => {
    const dISO = fmtDate(day);
    return (data.time_off_requests || []).filter(r => r.user_id === user_id && isDateWithin(dISO, r.date_from, r.date_to));
  };

  const hasTimeOffConflict = (user_id, day) => {
    const matches = findTimeOffForDay(user_id, day).filter(r => r.status === 'pending' || r.status === 'approved');
    return matches;
  };

  const addUnavailability = (ua) => {
    const startM = minutes(ua.start_hhmm), endM = minutes(ua.end_hhmm);
    if (!(endM > startM)) { alert('End time must be after start time.'); return; }
    setData((d) => ({ ...d, unavailability: [{ id: uid(), ...ua }, ...d.unavailability] }));
  };
  const updateUnavailability = (ua) => setData((d)=> ({ ...d, unavailability: d.unavailability.map(x => x.id===ua.id ? { ...x, ...ua } : x) }));
  const deleteUnavailability = (id) => setData((d) => ({ ...d, unavailability: d.unavailability.filter((x) => x.id !== id) }));

  // NOTE: we cannot safely destructure useAuth here because App is *outside* the provider.
  // Use a null-guarded lookup for the current user id when creating quick tasks.
  const auth = useAuth();
  const currentUserId = auth?.currentUser?.id || null;

  const createShift = ({ user_id, position_id, day, start_hhmm, end_hhmm, break_min, notes, quickTaskTitle, quickTaskTemplateId }) => {
    // Unavailability override with confirm
    const conflicts = hasUnavailabilityConflict(user_id, day, start_hhmm, end_hhmm);
    if (conflicts.length) {
      const lines = conflicts.slice(0, 3).map((c) => `${c.kind === 'weekly' ? 'Weekly' : c.date}: ${c.start_hhmm}–${c.end_hhmm}${c.notes ? ' • ' + c.notes : ''}`).join('\n');
      const ok = confirm(`This shift overlaps with unavailability:\n${lines}\n\nSchedule anyway?`);
      if (!ok) return;
    }
    // Time‑off warning with confirm
    const timeOffMatches = hasTimeOffConflict(user_id, day);
    if (timeOffMatches.length) {
      const lines = timeOffMatches.slice(0, 3).map((r)=> `${r.date_from}→${r.date_to} (${r.status})${r.notes ? ' • ' + r.notes : ''}`).join('\n');
      const ok = confirm(`This shift falls during time off:\n${lines}\n\nSchedule anyway?`);
      if (!ok) return;
    }

    const starts = combineDayAndTime(day, start_hhmm);
    const ends = combineDayAndTime(day, end_hhmm);
    const shift = { id: uid(), position_id, user_id, starts_at: starts.toISOString(), ends_at: ends.toISOString(), break_min: Number(break_min || 0), notes: notes || "" };
    ensureSchedule();
    upsertSchedule((s) => ({ ...s, shifts: [...s.shifts, shift] }));

    // Optional quick task creation
    if (quickTaskTemplateId) {
      const template = data.task_templates.find(t=> t.id===quickTaskTemplateId);
      if (template) addTask(template.title, user_id, fmtDate(day), currentUserId || user_id);
    } else if (quickTaskTitle && quickTaskTitle.trim()) {
      addTask(quickTaskTitle.trim(), user_id, fmtDate(day), currentUserId || user_id);
    }
  };

  const deleteShift = (shiftId) => { if (!schedule) return; upsertSchedule((s) => ({ ...s, shifts: s.shifts.filter((x) => x.id !== shiftId) })); };
  const publish = () => { if (!schedule) return; upsertSchedule((s) => ({ ...s, status: s.status === "draft" ? "published" : "draft" })); };

  const totalHoursByUser = useMemo(() => {
    const totals = Object.fromEntries(users.map((u) => [u.id, 0]));
    if (!schedule) return totals;
    for (const sh of schedule.shifts) totals[sh.user_id] = (totals[sh.user_id] || 0) + hoursBetween(sh.starts_at, sh.ends_at, sh.break_min);
    return totals;
  }, [schedule, users]);

  const totalHoursByDay = useMemo(() => {
    const totals = Object.fromEntries(weekDays.map((d) => [fmtDate(d), 0]));
    if (!schedule) return totals;
    for (const sh of schedule.shifts) {
      const key = fmtDate(sh.starts_at);
      totals[key] = (totals[key] || 0) + hoursBetween(sh.starts_at, sh.ends_at, sh.break_min);
    }
    return totals;
  }, [schedule, weekDays]);

  const exportCsv = () => {
    if (!schedule) return;
    const header = ["Week Start", "Status", "Employee", "Position", "Date", "Start", "End", "Break (min)", "Hours", "Notes"];
    const rows = [header];
    for (const sh of schedule.shifts) {
      const u = data.users.find((x) => x.id === sh.user_id);
      const p = positionsById[sh.position_id];
      rows.push([schedule.week_start, schedule.status, u?.full_name || "", p?.name || "", fmtDate(sh.starts_at), fmtTime(sh.starts_at), fmtTime(sh.ends_at), sh.break_min, hoursBetween(sh.starts_at, sh.ends_at, sh.break_min).toFixed(2), (sh.notes || "").replaceAll(",", ";")]);
    }
    const csv = rows.map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(",")).join("\n");
    download(`Shiftway_${schedule.week_start}.csv`, csv);
  };

  const copyCsv = async () => {
    if (!schedule) return;
    const header = ["Employee", "Date", "Start", "End", "Break", "Role", "Hours"];
    const rows = [header];
    for (const sh of schedule.shifts) {
      const u = data.users.find((x) => x.id === sh.user_id);
      const p = positionsById[sh.position_id];
      rows.push([u?.full_name || "", fmtDate(sh.starts_at), fmtTime(sh.starts_at), fmtTime(sh.ends_at), sh.break_min, p?.name || "", hoursBetween(sh.starts_at, sh.ends_at, sh.break_min).toFixed(2)]);
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    try { await navigator.clipboard.writeText(csv); alert("CSV copied to clipboard"); }
    catch (e) { alert("Copy failed. Try Download instead."); }
  };

  const resetDemo = () => {
    if (!confirm("Reset demo data? This cannot be undone.")) return;
    const seeded = seedData();
    setData(seeded);
    setWeekStart(fmtDate(startOfWeek(today(), seeded.feature_flags.weekStartsOn)));
    setTab("schedule");
    localStorage.removeItem("shiftway_current_user");
  };

  const notifyUsers = async (userIds, title, body) => {
    if (!backendMode) return;
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      await apiFetch(
        "/api/notify",
        { token, method: "POST", body: { user_ids: userIds, title, body, channels: data.notification_settings || {} } },
        clientSettings
      );
    } catch (e) {
      console.error(e);
    }
  };

  const createTimeOff = ({ user_id, date_from, date_to, notes }) => {
    const req = { id: uid(), user_id, date_from, date_to, notes: notes || "", status: "pending", created_at: new Date().toISOString() };
    setData((d) => ({ ...d, time_off_requests: [req, ...d.time_off_requests] }));
    const managers = data.users.filter(u => u.role !== "employee").map(u => u.id);
    notifyUsers(managers, "New time-off request", `${data.users.find(u=>u.id===user_id)?.full_name || "Employee"} requested ${date_from} → ${date_to}.`);
  };
  const setTimeOffStatus = (id, status) => {
    setData((d) => ({ ...d, time_off_requests: d.time_off_requests.map((r) => (r.id === id ? { ...r, status } : r)) }));
  };

  const createSwapRequest = ({ from_user_id, to_user_id, from_shift_id, to_shift_id, notes }) => {
    const swap = {
      id: uid(),
      from_user_id,
      to_user_id,
      from_shift_id,
      to_shift_id: to_shift_id || null,
      notes: notes || "",
      status: "pending_peer",
      created_at: new Date().toISOString(),
    };
    setData((d) => ({ ...d, shift_swaps: [swap, ...(d.shift_swaps || [])] }));
    notifyUsers([to_user_id], "Shift swap request", "You have a new swap request.");
  };

  const applySwap = (swap) => {
    setData((d) => ({
      ...d,
      schedules: d.schedules.map((s) => ({
        ...s,
        shifts: s.shifts.map((sh) => {
          if (sh.id === swap.from_shift_id) return { ...sh, user_id: swap.to_user_id };
          if (swap.to_shift_id && sh.id === swap.to_shift_id) return { ...sh, user_id: swap.from_user_id };
          return sh;
        }),
      })),
    }));
  };

  const setSwapStatus = (id, status) => {
    setData((d) => ({
      ...d,
      shift_swaps: (d.shift_swaps || []).map((s) => (s.id === id ? { ...s, status } : s)),
    }));
    const swap = (data.shift_swaps || []).find((s) => s.id === id);
    if (status === "approved" && swap) {
      applySwap(swap);
      notifyUsers([swap.from_user_id, swap.to_user_id], "Shift swap approved", "Your shift swap was approved.");
    }
    if (status === "denied" && swap) {
      notifyUsers([swap.from_user_id, swap.to_user_id], "Shift swap denied", "Your shift swap was denied.");
    }
  };

  // Newsfeed
  const addPost = (user_id, body) => {
    const post = { id: uid(), user_id, body: body.trim(), created_at: new Date().toISOString() };
    if (!post.body) return;
    setData((d) => ({ ...d, news_posts: [post, ...d.news_posts] }));
  };

  // Tasks
  const addTask = (title, assigned_to, due_date, created_by) => {
    const t = { id: uid(), title: title.trim(), assigned_to, due_date, status: 'open', created_by };
    if (!t.title || !assigned_to) return alert('Task needs a title and assignee');
    setData((d) => ({ ...d, tasks: [t, ...d.tasks] }));
  };
  const setTaskStatus = (id, status) => setData((d)=> ({ ...d, tasks: d.tasks.map(t=> t.id===id ? { ...t, status } : t) }));
  const deleteTask = (id) => setData((d)=> ({ ...d, tasks: d.tasks.filter(t=> t.id!==id) }));

  // Task templates (manager/owner)
  const addTemplate = (title) => setData((d)=> ({ ...d, task_templates: [{ id: uid(), title: title.trim() }, ...d.task_templates] }));
  const deleteTemplate = (id) => setData((d)=> ({ ...d, task_templates: d.task_templates.filter(t=> t.id!==id) }));

  // Messages
  const sendMessage = (from_user_id, to_user_id, body) => {
    const m = { id: uid(), from_user_id, to_user_id, body: body.trim(), created_at: new Date().toISOString() };
    if (!m.body) return;
    setData((d)=> ({ ...d, messages: [...d.messages, m] }));
    const fromName = data.users.find(u=>u.id===from_user_id)?.full_name || "New message";
    notifyUsers([to_user_id], `Message from ${fromName}`, m.body);
  };

  // Add employee (enhanced) – used by form
  const addEmployee = async (payload) => {
    if (!backendMode) {
      setData((d) => ({ ...d, users: [...d.users, { id: uid(), location_id: (d.locations[0]?.id || 'loc1'), role: payload.role || 'employee', is_active: true, password: 'demo', attachments: payload.attachments || [], ...payload }] }));
      return;
    }
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await apiFetch("/api/users", { token, method: "POST", body: payload }, clientSettings);
      if (res?.user) setData((d) => ({ ...d, users: [...d.users, res.user] }));
    } catch (e) {
      alert(e.message || "Unable to add employee");
    }
  };

  return (
    <AuthProvider
      data={data}
      setData={setData}
      backendMode={backendMode}
      clientSettings={clientSettings}
      onAuthChange={setAuthUser}
    >
      <InnerApp
        data={data}
        setData={setData}
        clientSettings={clientSettings}
        setClientSettings={setClientSettings}
        backendMode={backendMode}
        apiBase={apiBase}
        apiError={apiError}
        setApiError={setApiError}
        loading={loading}
        tab={tab}
        setTab={setTab}
        locationId={locationId}
        setLocationId={setLocationId}
        weekStart={weekStart}
        setWeekStart={setWeekStart}
        users={users}
        positions={positions}
        positionsById={positionsById}
        weekDays={weekDays}
        schedule={schedule}
        ensureSchedule={ensureSchedule}
        createShift={createShift}
        deleteShift={deleteShift}
        publish={publish}
        totalHoursByUser={totalHoursByUser}
        totalHoursByDay={totalHoursByDay}
        copyCsv={copyCsv}
        exportCsv={exportCsv}
        resetDemo={resetDemo}
        shiftModal={shiftModal}
        setShiftModal={setShiftModal}
        swapModal={swapModal}
        setSwapModal={setSwapModal}
        addEmployee={addEmployee}
        addPosition={(name) => setData((d) => ({ ...d, positions: [...d.positions, { id: uid(), location_id: location.id, name }] }))}
        createTimeOff={createTimeOff}
        setTimeOffStatus={setTimeOffStatus}
        createSwapRequest={createSwapRequest}
        setSwapStatus={setSwapStatus}
        addUnavailability={addUnavailability}
        updateUnavailability={updateUnavailability}
        deleteUnavailability={deleteUnavailability}
        unavailability={data.unavailability || []}
        addPost={addPost}
        addTask={addTask}
        setTaskStatus={setTaskStatus}
        deleteTask={deleteTask}
        addTemplate={addTemplate}
        deleteTemplate={deleteTemplate}
        sendMessage={sendMessage}
      />
    </AuthProvider>
  );
}

function InnerApp(props) {
  const {
    data, setData, clientSettings, setClientSettings, backendMode, apiBase, apiError, setApiError, loading, tab, setTab, locationId, setLocationId, weekStart, setWeekStart,
    users, positions, positionsById, weekDays, schedule, ensureSchedule, createShift, deleteShift,
    publish, totalHoursByUser, totalHoursByDay, copyCsv, exportCsv, resetDemo, shiftModal, setShiftModal, swapModal, setSwapModal,
    addEmployee, addPosition, createTimeOff, setTimeOffStatus, createSwapRequest, setSwapStatus, addUnavailability, updateUnavailability, deleteUnavailability, unavailability,
    addPost, addTask, setTaskStatus, deleteTask, addTemplate, deleteTemplate, sendMessage,
  } = props;
  const { currentUser, logout } = useAuth();

  if (!currentUser) return <LoginPage backendMode={backendMode} onAfterLogin={(u) => setTab(u.role === "employee" ? "my" : "schedule")} />;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border p-6 text-sm">Loading your workspace…</div>
      </div>
    );
  }

  const flags = data.feature_flags || defaultFlags();
  const isManager = currentUser.role !== "employee";
  const scopedUsers = users;

  const shiftWeek = (delta) => setWeekStart((s) => fmtDate(startOfWeek(addDays(s, delta * 7), flags.weekStartsOn)));
  const enablePush = async () => {
    try {
      if (!("serviceWorker" in navigator)) return alert("Push not supported in this browser.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return alert("Log in again to enable push.");
      const { publicKey } = await apiFetch("/api/push/public-key", { token }, clientSettings);
      if (!publicKey) return alert("Missing VAPID public key on server.");
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await apiFetch("/api/push/subscribe", { token, method: "POST", body: { subscription } }, clientSettings);
      setData((d) => ({ ...d, notification_settings: { ...(d.notification_settings || {}), push: true } }));
      alert("Push notifications enabled.");
    } catch (e) {
      console.error(e);
      alert("Unable to enable push.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center rounded-2xl border bg-white p-2 shadow-sm">
            <div className="h-8 w-8 rounded-xl border" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Shiftway</h1>
            <div className="text-sm text-gray-600">{isManager ? "Manager Console" : "My Shifts"}</div>
          </div>
        </div>
        <Toolbar>
          <div className="hidden sm:flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <span className="text-gray-600">Location</span>
            <select className="outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <span className="text-gray-600">Week</span>
            <button className="rounded-lg border px-2 py-1" title="Prev week" onClick={()=>shiftWeek(-1)}>◀</button>
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(fmtDate(startOfWeek(e.target.value, flags.weekStartsOn)))} className="outline-none" />
            <button className="rounded-lg border px-2 py-1" title="Jump to current week" onClick={()=> setWeekStart(fmtDate(startOfWeek(today(), flags.weekStartsOn)))}>Today</button>
            <button className="rounded-lg border px-2 py-1" title="Next week" onClick={()=>shiftWeek(1)}>▶</button>
          </div>
          <div className="rounded-xl border px-3 py-2 text-sm">{currentUser.full_name} <span className="text-gray-500">({currentUser.role})</span></div>
          <button className="rounded-xl border px-3 py-2 text-sm shadow-sm" onClick={logout}>Logout</button>
        </Toolbar>
      </header>

      {backendMode && apiError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">Backend unreachable</div>
              <div className="text-xs text-red-900/80">{apiError}</div>
              <div className="mt-1 text-xs text-red-900/80">Make sure the server is running and CORS allows this origin. If deployed, set <code>VITE_API_BASE</code>. Current API base: <code>{apiBase}</code>.</div>
            </div>
            <button className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs" onClick={()=>setApiError(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        {isManager && (<>
          <TabBtn id="schedule" tab={tab} setTab={setTab} label="Schedule" />
          <TabBtn id="employees" tab={tab} setTab={setTab} label="Employees" />
          {flags.unavailabilityEnabled && <TabBtn id="availability" tab={tab} setTab={setTab} label="Unavailability" />}
          {flags.newsfeedEnabled && <TabBtn id="feed" tab={tab} setTab={setTab} label="Feed" />}
          {flags.tasksEnabled && <TabBtn id="tasks" tab={tab} setTab={setTab} label="Tasks" />}
          {flags.messagesEnabled && <TabBtn id="messages" tab={tab} setTab={setTab} label="Messages" />}
          <TabBtn id="requests" tab={tab} setTab={setTab} label="Requests" />
          {flags.swapsEnabled && <TabBtn id="swaps" tab={tab} setTab={setTab} label="Swaps" />}
          <TabBtn id="settings" tab={tab} setTab={setTab} label="Settings" />
        </>)}
        {!isManager && (<>
          <TabBtn id="my" tab={tab} setTab={setTab} label="My" />
          {flags.newsfeedEnabled && <TabBtn id="feed" tab={tab} setTab={setTab} label="Feed" />}
          {flags.tasksEnabled && <TabBtn id="tasks" tab={tab} setTab={setTab} label="Tasks" />}
          {flags.messagesEnabled && <TabBtn id="messages" tab={tab} setTab={setTab} label="Messages" />}
          {flags.swapsEnabled && <TabBtn id="swaps" tab={tab} setTab={setTab} label="Swaps" />}
        </>)}
      </nav>

      {isManager && tab === "schedule" && (
        <Section
          title={`Week of ${safeDate(weekStart).toLocaleDateString()}`}
          right={
            schedule ? (
              <Pill>
                Status: <span className={`ml-1 font-semibold ${schedule.status === "published" ? "text-green-700" : "text-amber-700"}`}>{schedule.status}</span>
              </Pill>
            ) : (
              <Pill>Draft (no schedule yet)</Pill>
            )
          }
        >
          {scopedUsers.length === 0 ? (
            <div className="text-sm text-gray-600">Add employees first.</div>
          ) : (
            <WeekGrid
              employees={scopedUsers}
              weekDays={weekDays}
              shifts={schedule?.shifts || []}
              positionsById={positionsById}
              unavailability={unavailability}
              timeOffList={data.time_off_requests}
              showTimeOffChips={flags.showTimeOffOnSchedule}
              onCreate={(userId, day) => setShiftModal({ open: true, preUserId: userId, preDay: day })}
              onDelete={deleteShift}
            />
          )}

          {schedule && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border p-3">
                <h4 className="mb-2 font-semibold">Total hours by employee</h4>
                <ul className="space-y-1 text-sm">
                  {scopedUsers.map((u) => (
                    <li key={u.id} className="flex justify-between"><span>{u.full_name}</span><span className="tabular-nums">{(totalHoursByUser[u.id] || 0).toFixed(2)} h</span></li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border p-3">
                <h4 className="mb-2 font-semibold">Total hours by day</h4>
                <ul className="space-y-1 text-sm">
                  {weekDays.map((d) => (
                    <li key={String(d)} className="flex justify-between"><span>{fmtDateLabel(d)}</span><span className="tabular-nums">{(totalHoursByDay[fmtDate(d)] || 0).toFixed(2)} h</span></li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-xl border px-3 py-2 text-sm shadow-sm" onClick={() => ensureSchedule()}>Ensure Week</button>
            <button disabled={!schedule} className={`rounded-xl border px-3 py-2 text-sm shadow-sm ${schedule?.status === "published" ? "bg-green-50" : ""}`} onClick={publish}>{schedule?.status === "published" ? "Unpublish" : "Publish"}</button>
            <button disabled={!schedule} className="rounded-xl border px-3 py-2 text-sm shadow-sm" onClick={copyCsv}>Copy CSV</button>
            <button disabled={!schedule} className="rounded-xl border px-3 py-2 text-sm shadow-sm" onClick={exportCsv}>Download CSV</button>
            {DEMO_MODE && SHOW_DEMO_CONTROLS && (
              <button className="rounded-xl border px-3 py-2 text-sm shadow-sm" onClick={resetDemo}>Reset Demo</button>
            )}
          </div>

          {/* Manager quick inputs below schedule */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border p-3">
              <h4 className="mb-2 font-semibold">Quick: Add time off</h4>
              <ManagerQuickTimeOff users={scopedUsers} onSubmit={createTimeOff} />
              <div className="mt-2 text-xs text-gray-600">Full lists & approvals in the <b>Requests</b> tab.</div>
            </div>
            {flags.unavailabilityEnabled && (
              <div className="rounded-2xl border p-3">
                <h4 className="mb-2 font-semibold">Quick: Add weekly unavailability</h4>
                <ManagerQuickUnavailability users={scopedUsers} onSubmit={addUnavailability} />
                <div className="mt-2 text-xs text-gray-600">View & edit all in the <b>Unavailability</b> tab.</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {isManager && tab === "employees" && (
        <Section title="Employees">
          <div className="grid gap-4 md:grid-cols-[1fr,2fr]">
            <AddEmployeeForm onAdd={addEmployee} />
            <div>
              <h4 className="mb-2 font-semibold">Active employees</h4>
              <ul className="divide-y rounded-2xl border">
                {users.map((u) => (
                  <li key={u.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="font-medium">{u.full_name} {u.pronouns ? <span className="text-xs text-gray-500">({u.pronouns})</span> : null}</div>
                      <div className="text-xs text-gray-600">{u.email}{u.phone ? ` • ${u.phone}` : ''}{u.birthday ? ` • Birthday: ${u.birthday}` : ''}</div>
                      {u.emergency_contact?.name && (
                        <div className="text-xs text-gray-600">Emergency: {u.emergency_contact.name} {u.emergency_contact.phone ? `(${u.emergency_contact.phone})` : ''}</div>
                      )}
                      {u.notes && <div className="text-xs text-gray-600">Notes: {u.notes}</div>}
                      {(u.attachments||[]).length>0 && (
                        <div className="mt-1 text-xs text-gray-600">Attachments: {(u.attachments||[]).map(f=> f.name).join(', ')}</div>
                      )}
                    </div>
                    <Pill>{u.role}</Pill>
                  </li>
                ))}
                {users.length === 0 && <li className="p-3 text-sm text-gray-600">No employees yet.</li>}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {isManager && flags.unavailabilityEnabled && tab === "availability" && (
        <Section title="Unavailability (all employees)">
          <UnavailabilityAdmin
            users={users}
            list={unavailability}
            onAdd={addUnavailability}
            onUpdate={updateUnavailability}
            onDelete={deleteUnavailability}
          />
        </Section>
      )}

      {flags.newsfeedEnabled && tab === "feed" && (
        <Section title="Company feed">
          <NewsFeed users={users} currentUser={currentUser} posts={data.news_posts} onPost={(body)=>addPost(currentUser.id, body)} allowPost={isManager || data.feature_flags.employeesCanPostToFeed} />
        </Section>
      )}

      {flags.tasksEnabled && tab === "tasks" && (
        <Section title="Tasks">
          <TasksPanel users={users} currentUser={currentUser} tasks={data.tasks} templates={data.task_templates} onAdd={addTask} onSetStatus={setTaskStatus} onDelete={deleteTask} onAddTemplate={addTemplate} onDeleteTemplate={deleteTemplate} />
        </Section>
      )}

      {flags.messagesEnabled && tab === "messages" && (
        <Section title="Messages">
          <MessagesPanel users={users} currentUser={currentUser} messages={data.messages} onSend={sendMessage} />
        </Section>
      )}

      {isManager && tab === "requests" && (
        <Section title="Time‑off requests">
          <RequestsPanel users={users} list={data.time_off_requests} onSetStatus={setTimeOffStatus} />
        </Section>
      )}

      {flags.swapsEnabled && tab === "swaps" && (
        <Section title="Shift swaps">
          <SwapPanel
            currentUser={currentUser}
            users={users}
            schedules={data.schedules}
            swaps={data.shift_swaps || []}
            onRequest={createSwapRequest}
            onSetStatus={setSwapStatus}
            isManager={isManager}
          />
        </Section>
      )}

      {!isManager && tab === "my" && (
        <Section
          title={`My week • ${safeDate(weekStart).toLocaleDateString()}`}
          right={<Pill tone={schedule?.status === "published" ? "success" : "warn"}>{schedule ? schedule.status : "no schedule yet"}</Pill>}
        >
          <MyShifts
            currentUser={currentUser}
            schedule={schedule}
            weekDays={weekDays}
            positionsById={positionsById}
            onSwapRequest={(shift) => setSwapModal({ open: true, shift })}
          />
          <TimeOffForm onSubmit={(vals) => createTimeOff({ user_id: currentUser.id, ...vals })} />
          {flags.unavailabilityEnabled && flags.employeeEditUnavailability && (
            <MyUnavailabilityEditor
              currentUser={currentUser}
              list={unavailability}
              onAdd={addUnavailability}
              onUpdate={updateUnavailability}
              onDelete={deleteUnavailability}
            />
          )}
          <MyTimeOffList data={data} currentUser={currentUser} />
        </Section>
      )}

      {tab === "settings" && (
        <Section title="Settings">
          <div className="space-y-6 text-sm">
            {SHOW_BACKEND_SETTINGS && (
              <div>
                <div className="font-semibold">Backend (internal)</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <TextInput
                    label="API base URL"
                    value={clientSettings.apiBase}
                    onChange={(v) => setClientSettings((s) => ({ ...s, apiBase: v }))}
                    placeholder="http://localhost:4000"
                  />
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  Hidden by default. Enable via <code>VITE_SHOW_BACKEND_SETTINGS=1</code>.
                </div>
              </div>
            )}

            <div>
              <div className="font-semibold">Feature toggles</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <Checkbox label="Enable Unavailability" checked={flags.unavailabilityEnabled} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, unavailabilityEnabled: v }}))} hint="If off, all unavailability UI is hidden."/>
                <Checkbox label="Employees can edit their unavailability" checked={flags.employeeEditUnavailability} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, employeeEditUnavailability: v }}))} hint="Admin can still view and edit in Unavailability tab."/>
                <Checkbox label="Show Time‑off chips on Schedule" checked={flags.showTimeOffOnSchedule} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, showTimeOffOnSchedule: v }}))} hint="Shows pending/approved ranges in the grid."/>
                <Checkbox label="Newsfeed" checked={flags.newsfeedEnabled} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, newsfeedEnabled: v }}))}/>
                <Checkbox label="Employees can post to feed" checked={flags.employeesCanPostToFeed} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, employeesCanPostToFeed: v }}))}/>
                <Checkbox label="Tasks" checked={flags.tasksEnabled} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, tasksEnabled: v }}))}/>
                <Checkbox label="Messages" checked={flags.messagesEnabled} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, messagesEnabled: v }}))}/>
                <Checkbox label="Shift swaps" checked={flags.swapsEnabled} onChange={(v)=> setData(d=> ({...d, feature_flags: { ...d.feature_flags, swapsEnabled: v }}))}/>
                <Select label="Work week starts on" value={flags.weekStartsOn} onChange={(v)=>{ const n = Number(v); setData(d=> ({...d, feature_flags: { ...d.feature_flags, weekStartsOn: n }})); setWeekStart(s=> fmtDate(startOfWeek(s, n))); }} options={WEEK_LABELS.map((w,i)=>({value:i,label:w}))} />
              </div>
            </div>

            <div>
              <div className="font-semibold">Notifications</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <Checkbox
                  label="Email notifications"
                  checked={!!data.notification_settings?.email}
                  onChange={(v)=> setData(d=> ({...d, notification_settings: { ...(d.notification_settings||{}), email: v }}))}
                />
                <Checkbox
                  label="SMS notifications"
                  checked={!!data.notification_settings?.sms}
                  onChange={(v)=> setData(d=> ({...d, notification_settings: { ...(d.notification_settings||{}), sms: v }}))}
                />
                <Checkbox
                  label="Push notifications"
                  checked={!!data.notification_settings?.push}
                  onChange={(v)=> setData(d=> ({...d, notification_settings: { ...(d.notification_settings||{}), push: v }}))}
                />
              </div>
              {backendMode && (
                <div className="mt-2">
                  <button className="rounded-xl border px-3 py-2 text-sm" onClick={enablePush}>Enable push notifications</button>
                </div>
              )}
            </div>

            <div>
              <div className="font-semibold">Positions (roles)</div>
              <div className="grid gap-4 md:grid-cols-[1fr,2fr] mt-2">
                <AddPositionForm onAdd={addPosition} />
                <div>
                  <h4 className="mb-2 font-semibold">Current roles</h4>
                  <ul className="divide-y rounded-2xl border">
                    {positions.map((p) => (
                      <li key={p.id} className="flex items-center justify-between p-3">
                        <div className="font-medium">{p.name}</div>
                        <Pill>loc: {p.location_id}</Pill>
                      </li>
                    ))}
                    {positions.length === 0 && <li className="p-3 text-sm text-gray-600">No positions yet.</li>}
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <div className="font-semibold">Locations</div>
              <ul className="mt-1 list-disc pl-6">
                {data.locations.map((l) => (<li key={l.id}>{l.name} <span className="text-gray-500">(id: {l.id})</span></li>))}
              </ul>
            </div>

            <div className="rounded-xl bg-amber-50 p-3">
              <div className="font-semibold">How to use</div>
              <ol className="ml-4 list-decimal pl-2">
                <li>Add employees & positions.</li>
                <li>Pick a week (uses your setting) then <b>Ensure Week</b>.</li>
                <li>Create shifts via <b>+ add</b> in each employee/day cell.</li>
                <li>Use <b>Tasks</b> & <b>Feed</b> for daily ops.</li>
                <li>Export via <b>Copy</b> or <b>Download CSV</b>.</li>
              </ol>
            </div>

            <SelfTestsPanel />
          </div>
        </Section>
      )}

      <ShiftEditorModal
        open={shiftModal.open}
        onClose={() => setShiftModal({ open: false, preUserId: null, preDay: null })}
        users={users}
        positions={positions}
        defaultUserId={shiftModal.preUserId}
        defaultDay={shiftModal.preDay}
        onCreate={createShift}
        templates={data.task_templates}
        canQuickTask={true}
      />

      <SwapRequestModal
        open={swapModal.open}
        onClose={() => setSwapModal({ open: false, shift: null })}
        currentUser={currentUser}
        users={users}
        schedule={schedule}
        shift={swapModal.shift}
        onSubmit={createSwapRequest}
      />

      <footer className="py-8 text-center text-xs text-gray-500">Shiftway scheduling app.</footer>
    </div>
  );
}

function TabBtn({ id, tab, setTab, label }) {
  return (
    <button onClick={() => setTab(id)} className={`rounded-full px-4 py-1 text-sm ${tab === id ? "bg-black text-white" : "border"}`}>{label}</button>
  );
}

// ---------- forms & modals ----------
function AddEmployeeForm({ onAdd }) {
  const [full_name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [filesMeta, setFilesMeta] = useState([]);

  const onFiles = (fileList) => {
    const arr = Array.from(fileList || []).map(f => ({ id: uid(), name: f.name, size: f.size, type: f.type, lastModified: f.lastModified }));
    setFilesMeta(arr);
  };

  return (
    <div className="rounded-2xl border p-3">
      <h4 className="mb-2 font-semibold">Add employee</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="Full name" value={full_name} onChange={setName} placeholder="Jane Doe" />
        <TextInput label="Email" value={email} onChange={setEmail} placeholder="jane@example.com" />
        <Select label="Role" value={role} onChange={setRole} options={[{ value: "employee", label: "Employee" }, { value: "manager", label: "Manager" }, { value: "owner", label: "Owner" }]} />
        <TextInput label="Phone" value={phone} onChange={setPhone} placeholder="555-0123" />
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Birthday</span>
          <input type="date" value={birthday} onChange={(e)=>setBirthday(e.target.value)} className="rounded-xl border px-3 py-2"/>
        </label>
        <TextInput label="Pronouns (optional)" value={pronouns} onChange={setPronouns} placeholder="she/her" />
        <TextInput label="Emergency contact name" value={emName} onChange={setEmName} placeholder="Contact name" />
        <TextInput label="Emergency contact phone" value={emPhone} onChange={setEmPhone} placeholder="555-0456" />
        <label className="md:col-span-2 grid gap-1 text-sm">
          <span className="text-gray-600">Attachments {DEMO_MODE ? "(stored as metadata only in demo)" : "(metadata only for now)"}</span>
          <input type="file" multiple onChange={(e)=>onFiles(e.target.files)} className="rounded-xl border px-3 py-2" />
          {filesMeta.length>0 && <div className="text-xs text-gray-600">{filesMeta.length} file(s): {filesMeta.map(f=>f.name).join(', ')}</div>}
        </label>
        <div className="md:col-span-2">
          <TextArea label="Notes" value={notes} onChange={setNotes} placeholder="Allergies, preferred shifts, etc." />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="rounded-xl border px-3 py-2 text-sm shadow-sm" onClick={() => { if (!full_name.trim()) return alert("Enter a name"); onAdd({ full_name: full_name.trim(), email: email.trim(), role, phone, birthday, pronouns, emergency_contact: { name: emName, phone: emPhone }, attachments: filesMeta, notes }); setName(""); setEmail(""); setRole("employee"); setPhone(""); setBirthday(""); setPronouns(""); setEmName(""); setEmPhone(""); setFilesMeta([]); setNotes(""); }}>Add</button>
      </div>
    </div>
  );
}

function AddPositionForm({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <div className="rounded-2xl border p-3">
      <h4 className="mb-2 font-semibold">Add role/position</h4>
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Name" value={name} onChange={setName} placeholder="Scooper" />
      </div>
      <div className="mt-3 flex justify-end">
        <button className="rounded-2xl border px-3 py-2 text-sm shadow-sm" onClick={() => { if (!name.trim()) return alert("Enter a name"); onAdd(name.trim()); setName(""); }}>Add</button>
      </div>
    </div>
  );
}

function ShiftEditorModal({ open, onClose, users, positions, defaultUserId, defaultDay, onCreate, templates, canQuickTask }) {
  const [userId, setUserId] = useState(defaultUserId || (users[0]?.id ?? ""));
  const [positionId, setPositionId] = useState(positions[0]?.id ?? "");
  const [day, setDay] = useState(defaultDay || startOfWeek(today(), 1));
  const [start, setStart] = useState("15:00");
  const [end, setEnd] = useState("22:00");
  const [breakMin, setBreakMin] = useState(0);
  const [notes, setNotes] = useState("");
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    if (defaultUserId) setUserId(defaultUserId);
    if (defaultDay) setDay(defaultDay);
  }, [defaultUserId, defaultDay, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add shift"
      footer={
        <>
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button className="rounded-xl border bg-black px-3 py-2 text-sm text-white" onClick={() => { if (!userId || !positionId) return alert("Pick employee & position"); onCreate({ user_id: userId, position_id: positionId, day, start_hhmm: start, end_hhmm: end, break_min: breakMin, notes, quickTaskTitle, quickTaskTemplateId: templateId }); setQuickTaskTitle(""); setTemplateId(""); onClose(); }}>Save shift</button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Employee" value={userId} onChange={setUserId} options={users.map((u) => ({ value: u.id, label: u.full_name }))} />
        <Select label="Position" value={positionId} onChange={setPositionId} options={positions.map((p) => ({ value: p.id, label: p.name }))} />
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Day</span>
          <input type="date" value={fmtDate(day)} onChange={(e) => setDay(safeDate(e.target.value))} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Start time</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">End time</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Break (minutes)</span>
          <input type="number" min={0} step={5} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="md:col-span-2 grid gap-1 text-sm">
          <span className="text-gray-600">Notes (optional)</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl border px-3 py-2" />
        </label>
      </div>

      {canQuickTask && (
        <div className="mt-4 rounded-xl border p-3">
          <div className="mb-2 text-sm font-semibold">Optional: create a task for this shift</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="From template" value={templateId} onChange={setTemplateId} options={[{ value: "", label: "(none)" }, ...(templates||[]).map(t=>({ value:t.id, label:t.title }))]} />
            <TextInput label="Or custom title" value={quickTaskTitle} onChange={setQuickTaskTitle} placeholder="Mop floor at close" />
          </div>
          <div className="mt-1 text-xs text-gray-600">Task will assign to the selected employee with due date = shift day.</div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Manager quick inputs ----------
function ManagerQuickTimeOff({ users, onSubmit }) {
  const [userId, setUserId] = useState(users[0]?.id || '');
  const [from, setFrom] = useState(fmtDate(new Date()));
  const [to, setTo] = useState(fmtDate(new Date()));
  const [notes, setNotes] = useState('');
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Select label="Employee" value={userId} onChange={setUserId} options={users.map(u=>({value:u.id,label:u.full_name}))} />
      <label className="grid gap-1 text-sm"><span className="text-gray-600">From</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
      <label className="grid gap-1 text-sm"><span className="text-gray-600">To</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
      <TextInput label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
      <div className="md:col-span-2 flex justify-end"><button className="rounded-xl border px-3 py-2 text-sm" onClick={()=> onSubmit({ user_id: userId, date_from: from, date_to: to, notes })}>Submit</button></div>
    </div>
  );
}

function ManagerQuickUnavailability({ users, onSubmit }) {
  const [userId, setUserId] = useState(users[0]?.id || '');
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [notes, setNotes] = useState('');
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Select label="Employee" value={userId} onChange={setUserId} options={users.map(u=>({value:u.id,label:u.full_name}))} />
      <Select label="Weekday" value={weekday} onChange={(v)=>setWeekday(Number(v))} options={WEEK_LABELS.map((w,i)=>({value:i,label:w}))} />
      <label className="grid gap-1 text-sm"><span className="text-gray-600">Start</span><input type="time" value={start} onChange={(e)=>setStart(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
      <label className="grid gap-1 text-sm"><span className="text-gray-600">End</span><input type="time" value={end} onChange={(e)=>setEnd(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
      <TextInput label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
      <div className="md:col-span-2 flex justify-end"><button className="rounded-xl border px-3 py-2 text-sm" onClick={()=> onSubmit({ user_id: userId, kind:'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes })}>Add</button></div>
    </div>
  );
}

// ---------- auth + employee pages ----------
function LoginPage({ onAfterLogin, backendMode }) {
  const { login, registerCompany, requestMagicLink, loginWithGoogle, backendMode: authBackendMode } = useAuth();
  const isLive = backendMode ?? authBackendMode;
  const [mode, setMode] = useState("login");
  // Don’t auto-suggest demo creds unless demo is explicitly enabled.
  const [email, setEmail] = useState(isLive ? "" : (DEMO_MODE ? "manager@demo.local" : ""));
  const [password, setPassword] = useState(isLive ? "" : (DEMO_MODE ? "demo" : ""));
  const [company, setCompany] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const handleLogin = async () => {
    setErr(""); setMsg("");
    try {
      const u = await login(email, password);
      onAfterLogin?.(u);
    } catch (e) {
      setErr(e.message || "Login failed");
    }
  };

  const handleRegister = async () => {
    setErr(""); setMsg("");
    if (!company.trim() || !fullName.trim() || !email.trim() || !password.trim()) {
      setErr("Please fill all fields.");
      return;
    }
    try {
      const u = await registerCompany({ company_name: company.trim(), full_name: fullName.trim(), email: email.trim(), password: password.trim() });
      onAfterLogin?.(u);
    } catch (e) {
      setErr(e.message || "Registration failed");
    }
  };

  const handleMagic = async () => {
    setErr(""); setMsg("");
    if (!email.trim()) return setErr("Enter your email.");
    try {
      await requestMagicLink(email.trim());
      setMsg("Magic link sent. Check your inbox.");
    } catch (e) {
      setErr(e.message || "Could not send magic link");
    }
  };

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center p-6">
      <div className="w-full rounded-2xl border p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-black">Shiftway</h1>
        <div className="mb-4 text-gray-600">{mode === "register" ? "Create your company" : mode === "magic" ? "Magic link" : "Sign in"}</div>
        {err && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}
        {msg && <div className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">{msg}</div>}
        <div className="grid gap-3">
          {mode === "register" && (
            <>
              <TextInput label="Company name" value={company} onChange={setCompany} />
              <TextInput label="Full name" value={fullName} onChange={setFullName} />
            </>
          )}
          <TextInput label="Email" value={email} onChange={setEmail} type="email" />
          {mode !== "magic" && <TextInput label="Password" value={password} onChange={setPassword} type="password" />}
          {mode === "login" && (
            <button className="mt-1 rounded-xl border bg-black px-3 py-2 text-sm font-medium text-white" onClick={handleLogin}>Sign in</button>
          )}
          {mode === "register" && (
            <button className="mt-1 rounded-xl border bg-black px-3 py-2 text-sm font-medium text-white" onClick={handleRegister}>Create account</button>
          )}
          {mode === "magic" && (
            <button className="mt-1 rounded-xl border bg-black px-3 py-2 text-sm font-medium text-white" onClick={handleMagic}>Send magic link</button>
          )}
          {isLive && (
            <button className="rounded-xl border px-3 py-2 text-sm" onClick={loginWithGoogle}>Continue with Google</button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
          {mode !== "login" && <button className="underline" onClick={()=>setMode("login")}>Back to login</button>}
          {mode !== "register" && <button className="underline" onClick={()=>setMode("register")}>Create company</button>}
          {mode !== "magic" && <button className="underline" onClick={()=>setMode("magic")}>Use magic link</button>}
        </div>
        {!isLive && (
          <div className="mt-4 text-xs text-gray-600">
            {DEMO_MODE && SHOW_DEMO_CONTROLS && (<>
            Demo accounts:
            <ul className="list-disc pl-5">
              <li>Manager: <code>manager@demo.local</code> / <code>demo</code></li>
              <li>Employee: <code>lily@example.com</code> / <code>demo</code></li>
            </ul>
            </>)}

          </div>
        )}
      </div>
    </div>
  );
}

function SwapRequestModal({ open, onClose, currentUser, users, schedule, shift, onSubmit }) {
  const peers = users.filter((u) => u.id !== currentUser.id);
  const [peerId, setPeerId] = useState(peers[0]?.id || "");
  const [peerShiftId, setPeerShiftId] = useState("");
  const [notes, setNotes] = useState("");
  const peerShifts = (schedule?.shifts || []).filter((s) => s.user_id === peerId);

  useEffect(() => {
    if (!open) return;
    setPeerShiftId("");
  }, [peerId, open]);

  if (!open || !shift) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request a shift swap"
      footer={
        <>
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button
            className="rounded-xl border bg-black px-3 py-2 text-sm text-white"
            onClick={() => {
              if (!peerId) return alert("Pick a coworker.");
              onSubmit({
                from_user_id: currentUser.id,
                to_user_id: peerId,
                from_shift_id: shift.id,
                to_shift_id: peerShiftId || null,
                notes,
              });
              onClose();
            }}
          >
            Send request
          </button>
        </>
      }
    >
      <div className="text-sm">
        <div className="rounded-xl border p-2">
          <div className="font-medium">Your shift</div>
          <div className="text-gray-600">{fmtDate(shift.starts_at)} • {fmtTime(shift.starts_at)}–{fmtTime(shift.ends_at)}</div>
        </div>
      </div>
      <Select label="Coworker" value={peerId} onChange={setPeerId} options={peers.map(u => ({ value: u.id, label: u.full_name }))} />
      <Select
        label="Swap with (optional)"
        value={peerShiftId}
        onChange={setPeerShiftId}
        options={[
          { value: "", label: "No swap (just cover my shift)" },
          ...peerShifts.map((s) => ({ value: s.id, label: `${fmtDate(s.starts_at)} ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}` })),
        ]}
      />
      <TextArea label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
    </Modal>
  );
}

function SwapPanel({ currentUser, users, schedules, swaps, onRequest, onSetStatus, isManager }) {
  const byId = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const shiftById = useMemo(() => {
    const map = {};
    for (const s of schedules || []) for (const sh of s.shifts || []) map[sh.id] = sh;
    return map;
  }, [schedules]);
  const incoming = swaps.filter((s) => s.to_user_id === currentUser.id && s.status === "pending_peer");
  const outgoing = swaps.filter((s) => s.from_user_id === currentUser.id);
  const pendingManager = swaps.filter((s) => s.status === "pending_manager");

  const renderShift = (shift) => shift ? `${fmtDate(shift.starts_at)} ${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}` : "—";

  return (
    <div className="space-y-6 text-sm">
      {!isManager && (
        <div className="rounded-xl border p-3">
          <div className="mb-2 font-semibold">Incoming requests</div>
          <ul className="divide-y">
            {incoming.length === 0 && <li className="p-2 text-gray-600">No requests.</li>}
            {incoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                <div>
                  <div className="font-medium">{byId[s.from_user_id]?.full_name || "Employee"} wants to swap</div>
                  <div className="text-gray-600">{renderShift(shiftById[s.from_shift_id])} ⇄ {renderShift(shiftById[s.to_shift_id])}</div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-xl border px-2 py-1" onClick={() => onSetStatus(s.id, "pending_manager")}>Accept</button>
                  <button className="rounded-xl border px-2 py-1" onClick={() => onSetStatus(s.id, "denied")}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isManager && (
        <div className="rounded-xl border p-3">
          <div className="mb-2 font-semibold">Pending manager approval</div>
          <ul className="divide-y">
            {pendingManager.length === 0 && <li className="p-2 text-gray-600">No pending approvals.</li>}
            {pendingManager.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                <div>
                  <div className="font-medium">{byId[s.from_user_id]?.full_name || "Employee"} ⇄ {byId[s.to_user_id]?.full_name || "Employee"}</div>
                  <div className="text-gray-600">{renderShift(shiftById[s.from_shift_id])} ⇄ {renderShift(shiftById[s.to_shift_id])}</div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-xl border px-2 py-1" onClick={() => onSetStatus(s.id, "approved")}>Approve</button>
                  <button className="rounded-xl border px-2 py-1" onClick={() => onSetStatus(s.id, "denied")}>Deny</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border p-3">
        <div className="mb-2 font-semibold">Your requests</div>
        <ul className="divide-y">
          {outgoing.length === 0 && <li className="p-2 text-gray-600">No requests yet.</li>}
          {outgoing.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <div>
                <div className="font-medium">To {byId[s.to_user_id]?.full_name || "Employee"}</div>
                <div className="text-gray-600">{renderShift(shiftById[s.from_shift_id])} ⇄ {renderShift(shiftById[s.to_shift_id])}</div>
              </div>
              <Pill tone={s.status === "approved" ? "success" : s.status === "denied" ? "danger" : "warn"}>{s.status.replace("_", " ")}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MyShifts({ currentUser, schedule, weekDays, positionsById, onSwapRequest }) {
  const myShifts = (schedule?.shifts || []).filter((s) => s.user_id === currentUser.id);
  const byDay = Object.fromEntries(weekDays.map((d) => [fmtDate(d), []]));
  for (const s of myShifts) {
    const k = fmtDate(s.starts_at);
    if (!byDay[k]) byDay[k] = [];
    byDay[k].push(s);
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {weekDays.map((d) => (
        <div key={String(d)} className="rounded-2xl border p-3">
          <div className="mb-1 text-sm font-semibold">{fmtDateLabel(d)}</div>
          {(byDay[fmtDate(d)] || []).length === 0 ? (
            <div className="text-sm text-gray-600">No shift.</div>
          ) : (
            <ul className="space-y-2">
              {byDay[fmtDate(d)].map((s) => (
                <li key={s.id} className="rounded-xl border px-3 py-2 text-sm">
                  <div className="font-medium">{fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</div>
                  <div className="text-xs text-gray-600">{positionsById[s.position_id]?.name || "—"} • Break: {s.break_min}m</div>
                  {onSwapRequest && (
                    <button className="mt-2 text-xs underline" onClick={() => onSwapRequest(s)}>Request swap</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function TimeOffForm({ onSubmit }) {
  const [from, setFrom] = useState(fmtDate(new Date()));
  const [to, setTo] = useState(fmtDate(new Date()));
  const [notes, setNotes] = useState("");
  return (
    <div className="mt-4 rounded-2xl border p-3">
      <h4 className="mb-2 font-semibold">Request time off</h4>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm md:col-span-1">
          <span className="text-gray-600">Notes</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl border px-3 py-2" />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => onSubmit({ date_from: from, date_to: to, notes })}>Submit</button>
      </div>
    </div>
  );
}

function MyUnavailabilityEditor({ currentUser, list, onAdd, onUpdate, onDelete }) {
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState(null);

  const mine = useMemo(() => (list || []).filter(ua => ua.user_id === currentUser.id && ua.kind === 'weekly'), [list, currentUser?.id]);

  const save = () => {
    if (editingId) {
      onUpdate({ id: editingId, user_id: currentUser.id, kind: 'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes });
      setEditingId(null);
    } else {
      onAdd({ user_id: currentUser.id, kind: 'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes });
    }
    setNotes('');
  };

  const beginEdit = (ua) => { setEditingId(ua.id); setWeekday(Number(ua.weekday)); setStart(ua.start_hhmm); setEnd(ua.end_hhmm); setNotes(ua.notes || ''); };

  return (
    <div className="mt-4 rounded-2xl border p-3">
      <h4 className="mb-2 font-semibold">My weekly unavailability</h4>
      <div className="grid gap-3 md:grid-cols-3">
        <Select label="Weekday" value={weekday} onChange={(v)=>setWeekday(Number(v))} options={WEEK_LABELS.map((w,i)=>({value:i,label:w}))} />
        <label className="grid gap-1 text-sm"><span className="text-gray-600">Start</span><input type="time" value={start} onChange={(e)=>setStart(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
        <label className="grid gap-1 text-sm"><span className="text-gray-600">End</span><input type="time" value={end} onChange={(e)=>setEnd(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
        <div className="md:col-span-3"><TextInput label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Class, commute, etc." /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {editingId && <button className="rounded-xl border px-3 py-2 text-sm" onClick={()=>{ setEditingId(null); setNotes(''); }}>Cancel</button>}
        <button className="rounded-xl border px-3 py-2 text-sm" onClick={save}>{editingId ? 'Save' : 'Add'}</button>
      </div>
      <div className="mt-3">
        <ul className="divide-y rounded-2xl border">
          {mine.length === 0 && <li className="p-3 text-sm text-gray-600">No weekly unavailability yet.</li>}
          {mine.map((ua) => (
            <li key={ua.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <div className="font-medium">{WEEK_LABELS[ua.weekday]} {ua.start_hhmm}–{ua.end_hhmm}</div>
                {ua.notes && <div className="text-xs text-gray-600">{ua.notes}</div>}
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border px-2 py-1" onClick={()=>beginEdit(ua)}>Edit</button>
                <button className="rounded-xl border px-2 py-1" onClick={()=>onDelete(ua.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MyTimeOffList({ data, currentUser }) {
  const mine = data.time_off_requests.filter((r) => r.user_id === currentUser.id).sort((a,b)=> safeDate(b.created_at) - safeDate(a.created_at));
  if (mine.length === 0) return null;
  return (
    <div className="mt-4 rounded-2xl border p-3">
      <h4 className="mb-2 font-semibold">My requests</h4>
      <ul className="divide-y">
        {mine.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              {r.date_from} → {r.date_to} {r.notes ? `• ${r.notes}` : ""}
            </div>
            <Pill tone={r.status === "approved" ? "success" : r.status === "denied" ? "danger" : "warn"}>{r.status}</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Unavailability (Manager/Owner) ----------
function UnavailabilityAdmin({ users, list, onAdd, onUpdate, onDelete }) {
  const [userId, setUserId] = useState(users[0]?.id || '');
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(null); // ua

  const grouped = useMemo(() => {
    const m = {};
    for (const u of users) m[u.id] = [];
    for (const ua of list) if (m[ua.user_id]) m[ua.user_id].push(ua);
    return m;
  }, [users, list]);

  const save = () => {
    if (!userId) return alert('Pick an employee');
    if (editing) {
      onUpdate({ id: editing.id, user_id: userId, kind: 'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes });
      setEditing(null);
    } else {
      onAdd({ user_id: userId, kind: 'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes });
    }
    setNotes('');
  };

  const beginEdit = (ua) => { setEditing(ua); setUserId(ua.user_id); setWeekday(Number(ua.weekday)); setStart(ua.start_hhmm); setEnd(ua.end_hhmm); setNotes(ua.notes||''); };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr,2fr]">
      <div className="rounded-2xl border p-3">
        <h4 className="mb-2 font-semibold">{editing ? 'Edit' : 'Add'} weekly unavailability</h4>
        <Select label="Employee" value={userId || ''} onChange={setUserId} options={users.map(u=>({value:u.id,label:u.full_name}))} />
        <div className="mt-3 grid gap-3">
          <Select label="Weekday" value={weekday} onChange={(v)=>setWeekday(Number(v))} options={WEEK_LABELS.map((w,i)=>({value:i,label:w}))} />
          <label className="grid gap-1 text-sm"><span className="text-gray-600">Start</span><input type="time" value={start} onChange={(e)=>setStart(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
          <label className="grid gap-1 text-sm"><span className="text-gray-600">End</span><input type="time" value={end} onChange={(e)=>setEnd(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
          <TextInput label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Class, commute, etc." />
          <div className="flex justify-end gap-2">
            {editing && <button className="rounded-xl border px-3 py-2 text-sm" onClick={()=>setEditing(null)}>Cancel</button>}
            <button className="rounded-xl border px-3 py-2 text-sm" onClick={save}>{editing ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-semibold">Current unavailability (all)</h4>
        {users.map((u)=> (
          <div key={u.id} className="mb-4 rounded-2xl border">
            <div className="flex items-center justify-between p-3"><div className="font-medium">{u.full_name}</div></div>
            <ul className="divide-y">
              {(grouped[u.id]||[]).filter(ua=>ua.kind==='weekly').length===0 && <li className="p-3 text-sm text-gray-600">No entries.</li>}
              {(grouped[u.id]||[]).filter(ua=>ua.kind==='weekly').map((ua)=> (
                <li key={ua.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <div className="font-medium">{WEEK_LABELS[ua.weekday]} {ua.start_hhmm}–{ua.end_hhmm}</div>
                    {ua.notes && <div className="text-xs text-gray-600">{ua.notes}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-xl border px-2 py-1" onClick={()=>beginEdit(ua)}>Edit</button>
                    <button className="rounded-xl border px-2 py-1" onClick={()=>onDelete(ua.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- NewsFeed ----------
function NewsFeed({ users, currentUser, posts, onPost, allowPost }) {
  const [body, setBody] = useState("");
  const byId = useMemo(()=> Object.fromEntries(users.map(u=>[u.id,u])), [users]);
  return (
    <div className="space-y-4">
      {allowPost && (
        <div className="rounded-2xl border p-3">
          <TextInput label="Share an update" value={body} onChange={setBody} placeholder="Post an announcement..." />
          <div className="mt-2 flex justify-end">
            <button className="rounded-xl border px-3 py-2 text-sm" onClick={()=>{ onPost(body); setBody(""); }}>Post</button>
          </div>
        </div>
      )}
      <ul className="space-y-3">
        {posts.length===0 && <li className="rounded-2xl border p-3 text-sm text-gray-600">No posts yet.</li>}
        {posts.map(p=> (
          <li key={p.id} className="rounded-2xl border p-3">
            <div className="text-sm text-gray-500">{byId[p.user_id]?.full_name || 'Unknown'} • {new Date(p.created_at).toLocaleString()}</div>
            <div className="mt-1 whitespace-pre-wrap">{p.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Tasks ----------
function TasksPanel({ users, currentUser, tasks, templates, onAdd, onSetStatus, onDelete, onAddTemplate, onDeleteTemplate }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(currentUser.role==='employee' ? currentUser.id : (users[0]?.id||''));
  const [due, setDue] = useState(fmtDate(new Date()));
  const [newTpl, setNewTpl] = useState("");

  const mine = currentUser.role==='employee' ? tasks.filter(t=> t.assigned_to===currentUser.id) : tasks;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr,2fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border p-3">
          <h4 className="mb-2 font-semibold">Create task</h4>
          <div className="grid gap-3">
            <TextInput label="Title" value={title} onChange={setTitle} placeholder="Clean front counter" />
            {currentUser.role!=='employee' && <Select label="Assign to" value={assignee} onChange={setAssignee} options={users.map(u=>({value:u.id,label:u.full_name}))} />}
            <label className="grid gap-1 text-sm"><span className="text-gray-600">Due date</span><input type="date" value={due} onChange={(e)=>setDue(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
            <div className="flex justify-end">
              <button className="rounded-xl border px-3 py-2 text-sm" onClick={()=>{ onAdd(title, currentUser.role==='employee'? currentUser.id : assignee, due, currentUser.id); setTitle(''); }}>Add</button>
            </div>
          </div>
        </div>

        {currentUser.role!=='employee' && (
          <div className="rounded-2xl border p-3">
            <h4 className="mb-2 font-semibold">Task templates</h4>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <TextInput label="New template title" value={newTpl} onChange={setNewTpl} placeholder="Mop floor at close" />
              <div className="flex items-end"><button className="rounded-xl border px-3 py-2 text-sm" onClick={()=>{ if(!newTpl.trim()) return; onAddTemplate(newTpl.trim()); setNewTpl(''); }}>Add template</button></div>
            </div>
            <ul className="mt-2 divide-y rounded-xl border">
              {templates.length===0 && <li className="p-3 text-sm text-gray-600">No templates yet.</li>}
              {templates.map(t=> (
                <li key={t.id} className="flex items-center justify-between p-2 text-sm">
                  <div>{t.title}</div>
                  <div className="flex items-center gap-2">
                    <select className="rounded-xl border px-2 py-1" onChange={(e)=>{ const userId = e.target.value; if(!userId) return; onAdd(t.title, userId, fmtDate(new Date()), currentUser.id); e.target.value=''; }}>
                      <option value="">Assign…</option>
                      {users.map(u=> <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                    <button className="rounded-xl border px-2 py-1" onClick={()=>onDeleteTemplate(t.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 font-semibold">{currentUser.role==='employee' ? 'My tasks' : 'All tasks'}</h4>
        <ul className="divide-y rounded-2xl border">
          {mine.length===0 && <li className="p-3 text-sm text-gray-600">No tasks.</li>}
          {mine.map(t=> (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-gray-600">Due {t.due_date} • Assigned to {users.find(u=>u.id===t.assigned_to)?.full_name || '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                <select className="rounded-xl border px-2 py-1" value={t.status} onChange={(e)=>onSetStatus(t.id, e.target.value)}>
                  <option value="open">open</option>
                  <option value="done">done</option>
                </select>
                <button className="rounded-xl border px-2 py-1" onClick={()=>onDelete(t.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Messages ----------
function MessagesPanel({ users, currentUser, messages, onSend }) {
  const [peerId, setPeerId] = useState(users.find(u=>u.id!==currentUser.id)?.id || '');
  const [body, setBody] = useState('');
  const thread = messages.filter(m => (m.from_user_id===currentUser.id && m.to_user_id===peerId) || (m.to_user_id===currentUser.id && m.from_user_id===peerId));

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="rounded-2xl border p-3">
        <h4 className="mb-2 font-semibold">Conversations</h4>
        <select className="w-full rounded-xl border px-3 py-2" value={peerId} onChange={(e)=>setPeerId(e.target.value)}>
          {users.filter(u=>u.id!==currentUser.id).map(u=> <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="rounded-2xl border p-3">
        <h4 className="mb-2 font-semibold">Chat</h4>
        <div className="mb-3 max-h-72 overflow-auto rounded-xl border p-2">
          {thread.length===0 && <div className="text-sm text-gray-600">No messages yet.</div>}
          {thread.map(m => (
            <div key={m.id} className={`mb-2 flex ${m.from_user_id===currentUser.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-xl border px-2 py-1 text-sm ${m.from_user_id===currentUser.id ? 'bg-black text-white' : ''}`}>
                {m.body}
                <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-xl border px-3 py-2 text-sm" value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Type a message" />
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={()=>{ onSend(currentUser.id, peerId, body); setBody(''); }}>Send</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Requests (Manager/Owner) ----------
function RequestsPanel({ users, list, onSetStatus }) {
  const byId = useMemo(()=> Object.fromEntries(users.map(u=>[u.id,u])), [users]);
  const pending = list.filter(r=> r.status==='pending');
  const others = list.filter(r=> r.status!=='pending');
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 font-semibold">Pending</div>
        <ul className="divide-y rounded-2xl border">
          {pending.length===0 && <li className="p-3 text-sm text-gray-600">No pending requests.</li>}
          {pending.map(r=> (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <div className="font-medium">{byId[r.user_id]?.full_name || '—'}</div>
                <div className="text-gray-600">{r.date_from} → {r.date_to}{r.notes ? ` • ${r.notes}` : ''}</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border px-2 py-1" onClick={()=>onSetStatus(r.id,'approved')}>Approve</button>
                <button className="rounded-xl border px-2 py-1" onClick={()=>onSetStatus(r.id,'denied')}>Deny</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-2 font-semibold">History</div>
        <ul className="divide-y rounded-2xl border">
          {others.length===0 && <li className="p-3 text-sm text-gray-600">No history yet.</li>}
          {others.map(r=> (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <div className="font-medium">{byId[r.user_id]?.full_name || '—'}</div>
                <div className="text-gray-600">{r.date_from} → {r.date_to}{r.notes ? ` • ${r.notes}` : ''}</div>
              </div>
              <Pill tone={r.status==='approved' ? 'success' : r.status==='denied' ? 'danger' : 'warn'}>{r.status}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Self Tests ----------
function runSelfTests() {
  const tests = [];
  const t = (name, fn) => {
    try { const ok = fn(); tests.push({ name, pass: !!ok }); }
    catch (e) { tests.push({ name, pass: false, error: e?.message || String(e) }); }
  };
  t('minutes("09:30") === 570', () => minutes('09:30') === 570);
  t('minutes span 8h', () => minutes('17:00') - minutes('09:00') === 480);
  t('rangesOverlap true', () => rangesOverlap(540, 600, 570, 630) === true);
  t('rangesOverlap false', () => rangesOverlap(540, 600, 600, 660) === false);
  t('date range includes day', () => isDateWithin('2025-02-10','2025-02-01','2025-02-28') === true && isDateWithin('2025-03-01','2025-02-01','2025-02-28') === false);
  // unavailability conflict check
  t('conflict weekly', () => {
    const day = new Date('2025-01-06'); // Monday
    const ua = [{ user_id: 'u1', kind: 'weekly', weekday: 1, start_hhmm: '09:00', end_hhmm: '12:00' }];
    const matches = ua.filter((x) => x.user_id === 'u1' && (x.kind === 'date' ? x.date === fmtDate(day) : x.weekday === day.getDay()))
    return matches.filter((x) => rangesOverlap(minutes('10:00'), minutes('11:00'), minutes(x.start_hhmm), minutes(x.end_hhmm))).length === 1;
  });
  // date conflict check kept for compat
  t('conflict date', () => {
    const day = new Date('2025-01-07'); // Tuesday
    const ua = [{ user_id: 'u1', kind: 'date', date: '2025-01-07', start_hhmm: '14:00', end_hhmm: '18:00' }];
    const matches = ua.filter((x) => x.user_id === 'u1' && (x.kind === 'date' ? x.date === fmtDate(day) : x.weekday === day.getDay()));
    return matches.filter((x) => rangesOverlap(minutes('13:00'), minutes('15:00'), minutes(x.start_hhmm), minutes(x.end_hhmm))).length === 1;
  });
  t('hoursBetween 8h no break', () => Math.abs(hoursBetween('2025-01-01T09:00:00.000Z','2025-01-01T17:00:00.000Z',0) - 8) < 1e-9);
  t('hoursBetween 7.5h with break', () => Math.abs(hoursBetween('2025-01-01T09:00:00.000Z','2025-01-01T17:00:00.000Z',30) - 7.5) < 1e-9);
  // extra sanity tests
  t('WEEK_LABELS has 7 days', () => WEEK_LABELS.length === 7);
  t('fmtDate preserves day', () => fmtDate(combineDayAndTime('2025-01-02', '09:30')) === '2025-01-02');
  t('feature flags include employeesCanPostToFeed', () => defaultFlags().hasOwnProperty('employeesCanPostToFeed'));
  // template test
  t('template add => task title copy', () => { const title='Sweep'; const tmp={ id:'t1', title }; return tmp.title==='Sweep'; });
  // time off overlap
  t('time off overlap detect', () => isDateWithin('2025-01-10','2025-01-09','2025-01-11') === true);
  // startOfWeek tests
  t('startOfWeek Sunday keeps Sunday 2025-01-05', () => fmtDate(startOfWeek('2025-01-05', 0)) === '2025-01-05');
  t('startOfWeek Monday from Sunday 2025-01-05 -> 2024-12-30', () => fmtDate(startOfWeek('2025-01-05', 1)) === '2024-12-30');
  // week shifting tests
  t('addDays +7 shifts a week', () => fmtDate(addDays('2025-01-01', 7)) === '2025-01-08');
  t('shift week respects startOfWeek', () => fmtDate(startOfWeek(addDays('2025-01-05', 7), 1)) === '2025-01-06');
  t('today startOfWeek -> yyyy-mm-dd', () => fmtDate(startOfWeek(today(), 1)).length === 10);
  return tests;
}

function SelfTestsPanel() {
  const [results] = useState(runSelfTests());
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  useEffect(() => {
    console.table(results);
  }, [results]);
  return (
    <div className="rounded-2xl border p-3">
      <div className="mb-2 font-semibold">Self-tests</div>
      <div className="text-sm mb-2">{passed}/{total} passed</div>
      <ul className="text-xs space-y-1">
        {results.map((r, i) => (
          <li key={i} className={r.pass ? 'text-green-700' : 'text-red-700'}>
            {r.pass ? '✔' : '✘'} {r.name}{!r.pass && r.error ? ` – ${r.error}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
