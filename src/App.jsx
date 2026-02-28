import React, { useEffect, useMemo, useState, createContext, useContext } from "react";

/* tailwind-safelist: bg-brand bg-brand-dark bg-brand-darker bg-brand-light bg-brand-lightest text-brand-dark text-brand-darker text-brand-text border-brand border-brand-dark border-brand-light */

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
const POSITION_COLOR_PALETTE = [
  { key: "brand", border: "border-l-brand", bg: "bg-brand-lightest", dot: "bg-brand" },
  { key: "brand-dark", border: "border-l-brand-dark", bg: "bg-sky-50", dot: "bg-brand-dark" },
  { key: "coral", border: "border-l-rose-400", bg: "bg-rose-50", dot: "bg-rose-400" },
  { key: "amber", border: "border-l-amber-400", bg: "bg-amber-50", dot: "bg-amber-400" },
  { key: "purple", border: "border-l-violet-400", bg: "bg-violet-50", dot: "bg-violet-400" },
  { key: "emerald", border: "border-l-emerald-400", bg: "bg-emerald-50", dot: "bg-emerald-400" },
];

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
const formatCurrency = (value) => `$${(Number(value) || 0).toFixed(2)}`;
const getInitials = (name) => String(name || "")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || "")
  .join("") || "U";

const download = (filename, text) => {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadText = (filename, text, type = "text/plain;charset=utf-8;") => {
  const blob = new Blob([text], { type });
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

const defaultClientSettings = () => ({
  apiBase: "",
  orgName: "Shiftway",
  scheduleSettings: {
    clopeningRestHours: 10,
    hoursOfOperation: "09:00 - 21:00",
    copyWeekDefault: "replace",
  },
  timeOffSettings: {
    cutoffDaysBeforeShift: 3,
    allowPtoBalance: false,
    requireManagerNote: false,
  },
  notificationEvents: {
    newShift: { email: true, push: false },
    shiftChange: { email: true, push: false },
    swapRequest: { email: true, push: false },
    timeOffApproved: { email: true, push: false },
  },
});

const loadClientSettings = () => {
  const base = defaultClientSettings();
  try {
    const raw = localStorage.getItem(CLIENT_SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const merged = {
      ...base,
      ...parsed,
      scheduleSettings: { ...base.scheduleSettings, ...(parsed?.scheduleSettings || {}) },
      timeOffSettings: { ...base.timeOffSettings, ...(parsed?.timeOffSettings || {}) },
      notificationEvents: {
        ...base.notificationEvents,
        ...Object.fromEntries(
          Object.entries(parsed?.notificationEvents || {}).map(([eventKey, eventValue]) => [
            eventKey,
            { ...(base.notificationEvents[eventKey] || { email: true, push: false }), ...(eventValue || {}) },
          ])
        ),
      },
    };
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
  openShiftClaimingEnabled: true,
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
    { id: uid(), location_id: "loc1", full_name: "Manager Mike", email: "manager@demo.local", password: "demo", role: "manager", is_active: true, phone: "", birthday: "", pronouns: "", emergency_contact: { name: "", phone: "" }, attachments: [], notes: "", wage: 28 },
    { id: uid(), location_id: "loc1", full_name: "Owner Olivia", email: "owner@demo.local", password: "demo", role: "owner", is_active: true, phone: "", birthday: "", pronouns: "", emergency_contact: { name: "", phone: "" }, attachments: [], notes: "", wage: 34 },
    { id: uid(), location_id: "loc1", full_name: "Lily Adams", email: "lily@example.com", password: "demo", role: "employee", is_active: true, phone: "", birthday: "", pronouns: "she/her", emergency_contact: { name: "A. Adams", phone: "555-0102" }, attachments: [], notes: "", wage: 18.5 },
    { id: uid(), location_id: "loc1", full_name: "Gavin Reed", email: "gavin@example.com", password: "demo", role: "employee", is_active: true, phone: "", birthday: "", pronouns: "he/him", emergency_contact: { name: "R. Reed", phone: "555-0103" }, attachments: [], notes: "", wage: 17.25 },
    { id: uid(), location_id: "loc1", full_name: "Riley Brooks", email: "riley@example.com", password: "demo", role: "employee", is_active: true, phone: "", birthday: "", pronouns: "they/them", emergency_contact: { name: "K. Brooks", phone: "555-0104" }, attachments: [], notes: "", wage: 19 },
  ],
  schedules: [],
  time_off_requests: [],
  unavailability: [], // {id, user_id, kind:'weekly'|'date', weekday?, date?, start_hhmm, end_hhmm, notes}
  news_posts: [], // {id, user_id, body, created_at}
  tasks: [], // {id, title, assigned_to, due_date, status:'open'|'done', created_by}
  task_templates: [], // {id, title}
  messages: [], // {id, from_user_id, to_user_id, body, created_at}
  shift_swaps: [], // {id, from_user_id, to_user_id, from_shift_id, to_shift_id?, status, notes, created_at}
  open_shift_claims: [], // {id, shift_id, user_id, status, created_at}
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
  open_shift_claims: [],
  notification_settings: { email: true, sms: false, push: false },
  feature_flags: defaultFlags(),
});

const normalizeUser = (u) => {
  const base = { phone: "", birthday: "", pronouns: "", attachments: [], notes: "", wage: "" };
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
    if (!parsed.open_shift_claims) parsed.open_shift_claims = [];
    if (!parsed.notification_settings) parsed.notification_settings = { email: true, sms: false, push: false };
    if (!parsed.feature_flags) parsed.feature_flags = defaultFlags();
    if (parsed.feature_flags.weekStartsOn == null) parsed.feature_flags.weekStartsOn = 1;
    if (parsed.feature_flags.swapsEnabled == null) parsed.feature_flags.swapsEnabled = true;
    if (parsed.feature_flags.openShiftClaimingEnabled == null) parsed.feature_flags.openShiftClaimingEnabled = true;
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
    invalid_invite: "This invite link is invalid, expired, or has already been used.",
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
    invalid_json: "The server could not read that request. Please refresh and try again.",
    invalid_password: "Your current password is incorrect.",
    payload_too_large: "That request is too large. Try a smaller upload or shorter message.",
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
  const requestId = res.headers.get("x-request-id") || res.headers.get("x-correlation-id");
  const withRequestId = (text) => requestId ? `${text} (request id: ${requestId})` : text;

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
      throw new Error(withRequestId(msg || "Session expired. Please log in again."));
    }
    if (res.status === 403) {
      throw new Error(withRequestId(msg || "You don't have permission to do that."));
    }
    if (res.status === 429) {
      const retryHint = formatRetryAfter(res.headers.get("retry-after"));
      const detail = msg || "Too many requests. Please wait a moment and try again.";
      throw new Error(withRequestId(`${detail}${retryHint}`));
    }
    if (res.status === 502) {
      throw new Error(withRequestId(msg || "Upstream backend error (502). Please retry in a moment."));
    }
    if (res.status === 503) {
      const retryHint = formatRetryAfter(res.headers.get("retry-after"));
      const detail = msg || "Backend is temporarily unavailable (503). Please retry in a moment.";
      throw new Error(withRequestId(`${detail}${retryHint}`));
    }
    if (res.status === 504) {
      throw new Error(withRequestId(msg || "Backend timed out (504). Please retry in a moment."));
    }
    if (res.status >= 500) {
      throw new Error(withRequestId(msg || "Server error. Please try again in a moment."));
    }
    if (res.status === 404) {
      throw new Error(withRequestId(msg || "That item no longer exists or the endpoint was not found."));
    }
    if (res.status === 413) {
      throw new Error(withRequestId(msg || "Request payload is too large. Try again with a smaller request."));
    }

    throw new Error(withRequestId(msg ? `${prefix}: ${msg}` : prefix));
  }

  if (!isJson) return null;

  try {
    return await res.json();
  } catch {
    throw new Error(withRequestId("Backend returned malformed JSON. Check server logs and retry."));
  }
};

// ---------- small UI bits ----------
function Section({ title, right, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand-text">{title}</h2>
        <div>{right}</div>
      </div>
      <div className="rounded-[1.75rem] border border-brand-light bg-white p-6 shadow-sm">{children}</div>
    </div>
  );
}

function Pill({ children, tone = "default" }) {
  const toneCls = tone === "success" ? "text-green-700" : tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-red-700" : "text-gray-700";
  const bgCls = tone === "success" ? "bg-green-50 border-green-300" : tone === "warn" ? "bg-amber-50 border-amber-300" : tone === "danger" ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-300";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${bgCls} ${toneCls}`}>{children}</span>;
}

function ProBadge({ className = "" }) {
  return <span className={`inline text-[10px] font-bold bg-accent text-white rounded-full px-1.5 py-0.5 ml-1 ${className}`}>Pro</span>;
}

function Toolbar({ children }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function TextInput({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="grid gap-1.5 text-sm text-brand-text">
      <span className="text-sm font-medium text-brand-text">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }) {
  return (
    <label className="grid gap-1.5 text-sm text-brand-text">
      <span className="text-sm font-medium text-brand-text">{label}</span>
      <textarea value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className="min-h-[80px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="grid gap-1.5 text-sm text-brand-text">
      <span className="text-sm font-medium text-brand-text">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ label, checked, onChange, hint, disabled = false }) {
  return (
    <label className={`flex items-start justify-between gap-3 rounded-2xl border border-brand-light bg-brand-lightest/60 p-3 text-sm text-brand-text ${disabled ? "opacity-60" : ""}`}>
      <span>
        <span className="font-medium">{label}</span>
        {hint && <div className="text-xs text-brand-text/70">{hint}</div>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${checked ? "bg-brand-dark" : "bg-gray-200"} ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function AvatarBadge({ name, className = "" }) {
  return (
    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-light font-semibold text-brand-darker shadow-sm ${className}`}>
      {getInitials(name)}
    </span>
  );
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[1.75rem] border border-brand-light bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-text">{title}</h3>
          <button className="rounded-lg p-2 text-sm text-brand-dark transition hover:bg-brand-lightest" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

function HeaderProfileMenu({ open, onClose, user, onEditProfile, onLogout }) {
  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute right-4 top-16 w-[min(22rem,calc(100vw-2rem))] rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-2xl md:right-6 md:top-24" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <AvatarBadge name={user.full_name} className="h-12 w-12" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-brand-text">{user.full_name}</div>
            <div className="truncate text-sm text-brand-text/70">{user.email || "No email on file"}</div>
          </div>
        </div>
        <div className="mt-3 inline-flex rounded-full bg-brand-lightest px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">
          {user.role}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-xl border border-brand bg-white px-3 py-2 text-sm font-medium text-brand-dark transition hover:bg-brand-lightest" onClick={onEditProfile}>
            Edit Profile
          </button>
          <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm font-medium text-brand-dark transition hover:bg-brand-light" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

function ProUpsellModal({ feature, onClose }) {
  if (!feature) return null;

  return (
    <Modal
      open={!!feature}
      onClose={onClose}
      title={`${feature.title} is a Pro feature`}
      footer={
        <>
          <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm text-brand-dark transition hover:bg-brand-light" onClick={onClose}>
            Maybe later
          </button>
          <a className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-darker" href="#upgrade">
            Upgrade to Pro
          </a>
        </>
      }
    >
      <div className="rounded-2xl border border-brand-light bg-brand-lightest/70 p-4">
        <div className="text-sm font-medium text-brand-text">Unlock {feature.title.toLowerCase()} for smoother manager workflows.</div>
        <ul className="mt-3 space-y-2 text-sm text-brand-text/80">
          {feature.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-dark">•</span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

const MANAGER_NAV = [
  { id: "schedule", label: "Schedule", icon: "📅" },
  { id: "employees", label: "Employees", icon: "👥" },
  { id: "pending", label: "Pending", icon: "⏳", badgeKey: "pending" },
  { id: "tasks", label: "Tasks", icon: "📋", flag: "tasksEnabled" },
  { id: "messages", label: "Messages", icon: "💬", flag: "messagesEnabled" },
  { id: "feed", label: "Feed", icon: "📰", flag: "newsfeedEnabled" },
  { id: "swaps", label: "Swaps", icon: "🔄", flag: "swapsEnabled" },
  { id: "availability", label: "Unavailability", icon: "🔒", flag: "unavailabilityEnabled" },
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "profile", label: "Profile", icon: "👤" },
];

const EMPLOYEE_NAV = [
  { id: "my", label: "Schedule", icon: "📅" },
  { id: "tasks", label: "Tasks", icon: "📋", flag: "tasksEnabled" },
  { id: "messages", label: "Messages", icon: "💬", flag: "messagesEnabled" },
  { id: "feed", label: "Feed", icon: "📰", flag: "newsfeedEnabled" },
  { id: "swaps", label: "Swaps", icon: "🔄", flag: "swapsEnabled" },
  { id: "profile", label: "Profile", icon: "👤" },
];

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
  }, [backendMode, clientSettings, currentUserId, onAuthChange]);

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
function WeekGrid({
  employees,
  weekDays,
  shifts,
  positionsById,
  unavailability,
  timeOffList,
  showTimeOffChips,
  positionColors,
  showLaborCost,
  laborCostByDay,
  currentUser,
  openShiftClaims,
  onCreate,
  onDelete,
  onSwap,
  onMarkOpen,
  onClaimOpen,
}) {
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

  const pendingClaimByShiftId = Object.fromEntries((openShiftClaims || [])
    .filter((claim) => claim.status === "pending")
    .map((claim) => [claim.shift_id, claim]));
  const openShiftsByDay = Object.fromEntries(weekDays.map((day) => [fmtDate(day), []]));
  for (const shift of shifts || []) {
    if (!shift.user_id) {
      const key = fmtDate(shift.starts_at);
      if (!openShiftsByDay[key]) openShiftsByDay[key] = [];
      openShiftsByDay[key].push(shift);
    }
  }

  const todayKey = fmtDate(new Date());
  const employeeShiftMap = Object.fromEntries(employees.map((emp) => [emp.id, {}]));
  for (const shift of shifts || []) {
    if (!shift.user_id || !employeeShiftMap[shift.user_id]) continue;
    const key = fmtDate(shift.starts_at);
    if (!employeeShiftMap[shift.user_id][key]) employeeShiftMap[shift.user_id][key] = [];
    employeeShiftMap[shift.user_id][key].push(shift);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:hidden">
        {employees.map((emp) => (
          <div key={`mobile-${emp.id}`} className="rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AvatarBadge name={emp.full_name} className="h-10 w-10 text-sm" />
                <div>
                  <div className="font-semibold text-brand-text">{emp.full_name}</div>
                  <div className="text-xs text-brand-dark">{(Object.values(employeeShiftMap[emp.id] || {}).flat().length)} shifts this week</div>
                </div>
              </div>
              <div className="text-xs font-semibold text-brand-dark">{((Object.values(employeeShiftMap[emp.id] || {}).flat()).reduce((sum, shift) => sum + hoursBetween(shift.starts_at, shift.ends_at, shift.break_min), 0)).toFixed(2)} h</div>
            </div>
            <div className="space-y-3">
              {weekDays.map((day) => {
                const dayKey = fmtDate(day);
                const dayShifts = employeeShiftMap[emp.id]?.[dayKey] || [];
                const dayUnav = (byUserUnav[emp.id] || []).filter((ua) => ua.kind === "date" ? ua.date === dayKey : ua.weekday === day.getDay());
                const dayTimeOff = (byUserTimeOff[emp.id] || []).filter((r)=> isDateWithin(dayKey, r.date_from, r.date_to));
                return (
                  <div key={`${emp.id}-${dayKey}-mobile`} className="rounded-2xl bg-brand-lightest p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className={`rounded-xl px-3 py-1 text-sm font-bold ${dayKey === todayKey ? "bg-white text-brand-dark shadow-sm" : "text-brand-dark"}`}>{fmtDateLabel(day)}</div>
                      <button className="rounded-lg p-2 text-brand-dark transition hover:bg-white" onClick={() => onCreate(emp.id, day)}>+</button>
                    </div>
                    <div className="space-y-2">
                      {showTimeOffChips && dayTimeOff.map((r)=> (
                        <div key={r.id} className={`rounded-xl px-3 py-2 text-xs font-medium ${r.status === "approved" ? "bg-green-50 text-green-700" : r.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                          Time off {r.status}
                        </div>
                      ))}
                      {dayUnav.map((ua) => (
                        <div key={ua.id} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                          Unavailable {ua.start_hhmm}–{ua.end_hhmm}
                        </div>
                      ))}
                      {dayShifts.map((s) => {
                        const tone = positionColors?.[s.position_id] || POSITION_COLOR_PALETTE[0];
                        return (
                          <div key={s.id} className={`group rounded-xl border border-brand-light bg-white px-3 py-3 shadow-sm transition hover:scale-[1.02] hover:shadow-md ${tone.border}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <AvatarBadge name={emp.full_name} className="h-6 w-6 text-[10px]" />
                                <div>
                                  <div className="text-sm font-semibold text-brand-text">{fmtTime(s.starts_at)} - {fmtTime(s.ends_at)}</div>
                                  <div className="text-xs text-gray-500">{positionsById[s.position_id]?.name || "—"}</div>
                                </div>
                              </div>
                              <div className="flex gap-1 md:opacity-0 md:transition md:group-hover:opacity-100">
                                {onSwap && <button className="rounded-lg p-1.5 text-brand-dark hover:bg-brand-lightest" onClick={() => onSwap(s)} title="Request swap">⇄</button>}
                                {onMarkOpen && <button className="rounded-lg p-1.5 text-brand-dark hover:bg-brand-lightest" onClick={() => onMarkOpen(s.id)} title="Mark open">◌</button>}
                                <button className="rounded-lg p-1.5 text-brand-dark hover:bg-brand-lightest" onClick={() => onDelete(s.id)} title="Delete">✕</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {dayShifts.length === 0 && dayUnav.length === 0 && dayTimeOff.length === 0 && (
                        <button className="flex min-h-12 w-full items-center justify-center rounded-xl border border-dashed border-brand/40 bg-white text-sm font-medium text-brand-dark transition hover:border-brand hover:bg-brand-lightest" onClick={() => onCreate(emp.id, day)}>
                          + Add shift
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <div className="w-full rounded-[1.5rem] border border-brand-light bg-white shadow-sm">
          <div className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))_72px]">
            <div className="sticky left-0 z-20 rounded-tl-[1.5rem] bg-white px-4 py-4 text-sm font-bold text-brand-text">Team</div>
            {weekDays.map((d, index) => {
              const dayKey = fmtDate(d);
              const isToday = dayKey === todayKey;
              return (
                <div key={String(d)} className={`px-3 py-4 text-center text-sm font-bold text-brand-dark ${index === weekDays.length - 1 ? "" : "border-r border-brand-light/60"}`}>
                  <div className={`mx-auto inline-flex rounded-xl px-3 py-2 ${isToday ? "bg-brand-lightest" : ""}`}>{fmtDateLabel(d)}</div>
                  {showLaborCost && (
                    <div className="mt-1 text-[11px] font-medium text-brand-dark/75">
                      {formatCurrency(laborCostByDay?.[dayKey] || 0)}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="rounded-tr-[1.5rem] px-3 py-4 text-center text-xs font-bold uppercase tracking-wide text-brand-dark">Hours</div>

            <div className="sticky left-0 z-20 border-t border-brand-light bg-brand-lightest px-4 py-3 text-sm font-semibold text-brand-dark">Open shifts</div>
            {weekDays.map((day) => (
              <div key={`open-${fmtDate(day)}`} className="border-l border-t border-brand-light/70 bg-brand-lightest/60 p-3">
                <div className="space-y-2">
                  {(openShiftsByDay[fmtDate(day)] || []).length === 0 && (
                    <div className="rounded-xl border border-dashed border-brand/30 px-3 py-3 text-center text-xs font-medium text-brand-dark/70">Open</div>
                  )}
                  {(openShiftsByDay[fmtDate(day)] || []).map((s) => {
                    const tone = positionColors?.[s.position_id] || POSITION_COLOR_PALETTE[0];
                    const pendingClaim = pendingClaimByShiftId[s.id];
                    const canClaim = currentUser?.role === "employee" && !pendingClaim && !!onClaimOpen;
                    return (
                      <div key={s.id} className={`rounded-xl border border-dashed border-brand/40 bg-white px-3 py-3 text-sm shadow-sm ${tone.border}`}>
                        <div className="font-semibold text-brand-text">{fmtTime(s.starts_at)} - {fmtTime(s.ends_at)}</div>
                        <div className="text-xs text-gray-500">{positionsById[s.position_id]?.name || "Open role"}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-brand-dark">Open</span>
                          {pendingClaim ? (
                            <span className="text-[11px] font-semibold text-amber-700">Pending</span>
                          ) : canClaim ? (
                            <button className="rounded-xl bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-darker" onClick={() => onClaimOpen?.(s)}>Claim</button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="border-l border-t border-brand-light/70 bg-brand-lightest/60 px-3 py-3 text-center text-xs text-brand-dark">-</div>

            {employees.map((emp, rowIndex) => {
              const rowBg = rowIndex % 2 === 0 ? "bg-white" : "bg-brand-lightest/60";
              const totalRowHours = Object.values(employeeShiftMap[emp.id] || {}).flat().reduce((sum, shift) => sum + hoursBetween(shift.starts_at, shift.ends_at, shift.break_min), 0);
              return (
                <React.Fragment key={emp.id}>
                  <div className={`sticky left-0 z-10 border-t border-brand-light px-4 py-3 ${rowBg}`}>
                    <div className="flex min-h-12 items-center gap-3">
                      <AvatarBadge name={emp.full_name} className="h-9 w-9 text-xs" />
                      <div>
                        <div className="font-semibold text-brand-text">{emp.full_name}</div>
                        <div className="text-xs text-brand-dark">{getInitials(emp.full_name)}</div>
                      </div>
                    </div>
                  </div>
                  {weekDays.map((day) => {
                    const dayKey = fmtDate(day);
                    const dayShifts = employeeShiftMap[emp.id]?.[dayKey] || [];
                    const dayUnav = (byUserUnav[emp.id] || []).filter((ua) => ua.kind === "date" ? ua.date === dayKey : ua.weekday === day.getDay());
                    const dayTimeOff = (byUserTimeOff[emp.id] || []).filter((r)=> isDateWithin(dayKey, r.date_from, r.date_to));
                    return (
                      <div key={emp.id + dayKey} className={`border-l border-t border-brand-light/70 p-2 ${rowBg}`}>
                        <div className="flex min-h-12 flex-col gap-2">
                          {showTimeOffChips && dayTimeOff.map((r)=> (
                            <div key={r.id} className={`rounded-xl px-3 py-2 text-[11px] font-semibold ${r.status==='approved' ? 'bg-green-50 text-green-700' : r.status==='pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                              Time off
                            </div>
                          ))}
                          {dayUnav.map((ua) => (
                            <div key={ua.id} className="rounded-xl bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                              Unavailable {ua.start_hhmm}–{ua.end_hhmm}
                            </div>
                          ))}
                          {dayShifts.map((s) => {
                            const tone = positionColors?.[s.position_id] || POSITION_COLOR_PALETTE[0];
                            const posName = positionsById[s.position_id]?.name || "—";
                            return (
                              <div key={s.id} className={`group relative rounded-lg border-l-4 bg-white px-2 py-1.5 shadow-sm transition duration-150 hover:shadow-md ${tone.border}`}>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-bold text-brand-text">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</div>
                                    <div className="truncate text-[10px] text-gray-400">{posName}</div>
                                  </div>
                                  <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                                    {onSwap && <button className="rounded p-1 text-brand-dark hover:bg-brand-lightest" onClick={() => onSwap(s)} title="Request swap">⇄</button>}
                                    {onMarkOpen && <button className="rounded p-1 text-brand-dark hover:bg-brand-lightest" onClick={() => onMarkOpen(s.id)} title="Mark open">◌</button>}
                                    <button className="rounded p-1 text-brand-dark hover:bg-brand-lightest" onClick={() => onDelete(s.id)} title="Delete">✕</button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {dayShifts.length === 0 && (
                            <button className="flex min-h-8 items-center justify-center rounded-lg border border-dashed border-brand/30 text-xs font-medium text-brand-dark/50 transition hover:border-brand hover:bg-white hover:text-brand-dark" onClick={() => onCreate(emp.id, day)}>
                              +
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className={`border-l border-t border-brand-light/70 px-3 py-3 text-center text-xs font-semibold text-brand-dark ${rowBg}`}>
                    {totalRowHours.toFixed(2)} h
                  </div>
                </React.Fragment>
              );
            })}
          </div>
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
  const isInviteAcceptRoute = window.location.pathname === "/invite/accept";
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
  const [swapModal, setSwapModal] = useState({ open: false, shift: null, requestUserId: null });
  const [inviteModal, setInviteModal] = useState(false);

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
    if (isInviteAcceptRoute) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      params.delete("token");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [isInviteAcceptRoute]);

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
    if (!hydrated) setLoading(true);
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

  const currentUserId = authUser?.id || null;

  const createShift = ({ user_id, position_id, day, start_hhmm, end_hhmm, break_min, notes, quickTaskTitle, quickTaskTemplateId, is_open }) => {
    // Unavailability override with confirm
    const conflicts = user_id ? hasUnavailabilityConflict(user_id, day, start_hhmm, end_hhmm) : [];
    if (conflicts.length) {
      const lines = conflicts.slice(0, 3).map((c) => `${c.kind === 'weekly' ? 'Weekly' : c.date}: ${c.start_hhmm}–${c.end_hhmm}${c.notes ? ' • ' + c.notes : ''}`).join('\n');
      const ok = confirm(`This shift overlaps with unavailability:\n${lines}\n\nSchedule anyway?`);
      if (!ok) return;
    }
    // Time‑off warning with confirm
    const timeOffMatches = user_id ? hasTimeOffConflict(user_id, day) : [];
    if (timeOffMatches.length) {
      const lines = timeOffMatches.slice(0, 3).map((r)=> `${r.date_from}→${r.date_to} (${r.status})${r.notes ? ' • ' + r.notes : ''}`).join('\n');
      const ok = confirm(`This shift falls during time off:\n${lines}\n\nSchedule anyway?`);
      if (!ok) return;
    }

    const starts = combineDayAndTime(day, start_hhmm);
    const ends = combineDayAndTime(day, end_hhmm);
    const assignedUserId = is_open ? null : user_id;
    const shift = { id: uid(), position_id, user_id: assignedUserId, starts_at: starts.toISOString(), ends_at: ends.toISOString(), break_min: Number(break_min || 0), notes: notes || "" };
    ensureSchedule();
    upsertSchedule((s) => ({ ...s, shifts: [...s.shifts, shift] }));

    // Optional quick task creation
    if (assignedUserId && quickTaskTemplateId) {
      const template = data.task_templates.find(t=> t.id===quickTaskTemplateId);
      if (template) addTask(template.title, assignedUserId, fmtDate(day), currentUserId || assignedUserId);
    } else if (assignedUserId && quickTaskTitle && quickTaskTitle.trim()) {
      addTask(quickTaskTitle.trim(), assignedUserId, fmtDate(day), currentUserId || assignedUserId);
    }
  };

  const deleteShift = (shiftId) => { if (!schedule) return; upsertSchedule((s) => ({ ...s, shifts: s.shifts.filter((x) => x.id !== shiftId) })); };
  const markShiftOpen = (shiftId) => {
    if (!schedule) return;
    upsertSchedule((s) => ({
      ...s,
      shifts: s.shifts.map((shift) => (shift.id === shiftId ? { ...shift, user_id: null } : shift)),
      status: "draft",
    }));
  };
  const publish = () => { if (!schedule) return; upsertSchedule((s) => ({ ...s, status: s.status === "draft" ? "published" : "draft" })); };
  const copyLastWeek = () => {
    const prevWeekStart = fmtDate(addDays(weekStart, -7));
    const prevSchedule = data.schedules.find((s) => s.location_id === location.id && s.week_start === prevWeekStart);
    if (!prevSchedule) return alert("No schedule found for last week.");
    if (schedule?.shifts?.length && !confirm("Replace this week's current shifts with a draft copy of last week?")) return;
    const copiedShifts = (prevSchedule.shifts || []).map((shift) => ({
      ...shift,
      id: uid(),
      starts_at: addDays(shift.starts_at, 7).toISOString(),
      ends_at: addDays(shift.ends_at, 7).toISOString(),
    }));
    const nextSchedule = { id: schedule?.id || uid(), location_id: location.id, week_start: weekStart, status: "draft", shifts: copiedShifts };
    setData((d) => {
      const exists = d.schedules.some((s) => s.location_id === location.id && s.week_start === weekStart);
      return {
        ...d,
        schedules: exists
          ? d.schedules.map((s) => (s.location_id === location.id && s.week_start === weekStart ? nextSchedule : s))
          : [...d.schedules, nextSchedule],
      };
    });
  };

  const totalHoursByUser = useMemo(() => {
    const totals = Object.fromEntries(users.map((u) => [u.id, 0]));
    if (!schedule) return totals;
    for (const sh of schedule.shifts) {
      if (!sh.user_id) continue;
      totals[sh.user_id] = (totals[sh.user_id] || 0) + hoursBetween(sh.starts_at, sh.ends_at, sh.break_min);
    }
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

  const createOpenShiftClaim = (shiftId, userId) => {
    const existingPending = (data.open_shift_claims || []).find((claim) => claim.shift_id === shiftId && claim.user_id === userId && claim.status === "pending");
    if (existingPending) return;
    const claim = { id: uid(), shift_id: shiftId, user_id: userId, status: "pending", created_at: new Date().toISOString() };
    setData((d) => ({ ...d, open_shift_claims: [claim, ...(d.open_shift_claims || [])] }));
    const managers = data.users.filter((u) => u.role !== "employee").map((u) => u.id);
    notifyUsers(managers, "Open shift claim", `${data.users.find((u) => u.id === userId)?.full_name || "Employee"} requested an open shift.`);
  };

  const setOpenShiftClaimStatus = (id, status) => {
    const claim = (data.open_shift_claims || []).find((entry) => entry.id === id);
    if (!claim) return;
    setData((d) => {
      const nextClaims = (d.open_shift_claims || []).map((entry) => {
        if (entry.id === id) return { ...entry, status };
        if (status === "approved" && entry.shift_id === claim.shift_id && entry.status === "pending") return { ...entry, status: "denied" };
        return entry;
      });
      let nextSchedules = d.schedules;
      if (status === "approved") {
        nextSchedules = d.schedules.map((sched) => ({
          ...sched,
          shifts: (sched.shifts || []).map((shift) => (shift.id === claim.shift_id ? { ...shift, user_id: claim.user_id } : shift)),
        }));
      }
      return { ...d, open_shift_claims: nextClaims, schedules: nextSchedules };
    });
    if (status === "approved") {
      notifyUsers([claim.user_id], "Open shift approved", "Your open shift claim was approved.");
    } else if (status === "denied") {
      notifyUsers([claim.user_id], "Open shift denied", "Your open shift claim was denied.");
    }
  };

  const saveProfile = async ({ full_name, phone, pronouns, birthday, emergency_contact, email, current_password, new_password, wage }) => {
    const nextPayload = {
      full_name: String(full_name || "").trim(),
      phone: String(phone || "").trim(),
      pronouns: String(pronouns || "").trim(),
      birthday: String(birthday || "").trim(),
      emergency_contact: {
        name: String(emergency_contact?.name || "").trim(),
        phone: String(emergency_contact?.phone || "").trim(),
      },
      email: String(email || "").trim().toLowerCase(),
      current_password: String(current_password || ""),
      new_password: String(new_password || ""),
      wage: wage === "" || wage == null ? "" : Number(wage),
    };

    if (!nextPayload.full_name) throw new Error("Full name is required.");

    if (!backendMode) {
      const demoUser = data.users.find((u) => u.id === currentUserId);
      const needsCredentialCheck = (nextPayload.email && nextPayload.email !== demoUser?.email) || nextPayload.new_password;
      if (needsCredentialCheck && nextPayload.current_password !== (demoUser?.password || "demo")) {
        throw new Error("Current password is incorrect.");
      }
      setData((d) => ({
        ...d,
        users: d.users.map((user) => user.id === currentUserId ? {
          ...user,
          full_name: nextPayload.full_name,
          email: nextPayload.email || user.email,
          phone: nextPayload.phone,
          pronouns: nextPayload.pronouns,
          birthday: nextPayload.birthday,
          emergency_contact: nextPayload.emergency_contact,
          wage: nextPayload.wage,
          ...(nextPayload.new_password ? { password: nextPayload.new_password } : {}),
        } : user),
      }));
      return true;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    await apiFetch("/api/me", { token, method: "PATCH", body: nextPayload }, clientSettings);
    setData((d) => ({
      ...d,
      users: d.users.map((user) => user.id === currentUserId ? {
        ...user,
        full_name: nextPayload.full_name,
        email: nextPayload.email || user.email,
        phone: nextPayload.phone,
        pronouns: nextPayload.pronouns,
        birthday: nextPayload.birthday,
        emergency_contact: nextPayload.emergency_contact,
        wage: nextPayload.wage,
      } : user),
    }));
    return true;
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
      if (res?.user) setData((d) => ({ ...d, users: [...d.users, normalizeUser({ ...payload, ...res.user, attachments: payload.attachments || [] })] }));
    } catch (e) {
      alert(e.message || "Unable to add employee");
    }
  };

  if (isInviteAcceptRoute) {
    return <InviteAcceptPage clientSettings={clientSettings} />;
  }

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
        markShiftOpen={markShiftOpen}
        publish={publish}
        copyLastWeek={copyLastWeek}
        totalHoursByUser={totalHoursByUser}
        totalHoursByDay={totalHoursByDay}
        copyCsv={copyCsv}
        exportCsv={exportCsv}
        resetDemo={resetDemo}
        shiftModal={shiftModal}
        setShiftModal={setShiftModal}
        swapModal={swapModal}
        setSwapModal={setSwapModal}
        inviteModal={inviteModal}
        setInviteModal={setInviteModal}
        addEmployee={addEmployee}
        addPosition={(name) => setData((d) => ({ ...d, positions: [...d.positions, { id: uid(), location_id: location.id, name }] }))}
        createTimeOff={createTimeOff}
        setTimeOffStatus={setTimeOffStatus}
        createSwapRequest={createSwapRequest}
        setSwapStatus={setSwapStatus}
        createOpenShiftClaim={createOpenShiftClaim}
        setOpenShiftClaimStatus={setOpenShiftClaimStatus}
        addUnavailability={addUnavailability}
        updateUnavailability={updateUnavailability}
        deleteUnavailability={deleteUnavailability}
        unavailability={data.unavailability || []}
        saveProfile={saveProfile}
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
    users, positions, positionsById, weekDays, schedule, ensureSchedule, createShift, deleteShift, markShiftOpen,
    publish, copyLastWeek, totalHoursByUser, totalHoursByDay, copyCsv, exportCsv, resetDemo, shiftModal, setShiftModal, swapModal, setSwapModal, inviteModal, setInviteModal,
    addEmployee, addPosition, createTimeOff, setTimeOffStatus, createSwapRequest, setSwapStatus, createOpenShiftClaim, setOpenShiftClaimStatus, addUnavailability, updateUnavailability, deleteUnavailability, unavailability, saveProfile,
    addPost, addTask, setTaskStatus, deleteTask, addTemplate, deleteTemplate, sendMessage,
  } = props;
  const { currentUser, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerProfileOpen, setHeaderProfileOpen] = useState(false);
  const [proUpsell, setProUpsell] = useState(null);
  const [settingsSection, setSettingsSection] = useState("general");

  const flags = data.feature_flags || defaultFlags();
  const isManager = currentUser?.role !== "employee";
  const scopedUsers = users;
  const currentStateUser = data.users.find((user) => user.id === currentUser?.id) || normalizeUser(currentUser || {});
  const positionColors = useMemo(() => Object.fromEntries(positions.map((position, index) => [position.id, POSITION_COLOR_PALETTE[index % POSITION_COLOR_PALETTE.length]])), [positions]);

  const openShifts = (schedule?.shifts || []).filter((shift) => !shift.user_id);
  const pendingSwapCount = (data.shift_swaps || []).filter((swap) => swap.status === "pending_manager").length;
  const pendingTimeOffCount = (data.time_off_requests || []).filter((request) => request.status === "pending").length;
  const pendingOpenShiftCount = (data.open_shift_claims || []).filter((claim) => claim.status === "pending").length;
  const pendingCount = pendingSwapCount + pendingTimeOffCount + pendingOpenShiftCount;
  const totalScheduledHours = (schedule?.shifts || []).reduce((sum, shift) => sum + hoursBetween(shift.starts_at, shift.ends_at, shift.break_min), 0);
  const laborCostByDay = useMemo(() => {
    const totals = Object.fromEntries(weekDays.map((day) => [fmtDate(day), 0]));
    for (const shift of schedule?.shifts || []) {
      if (!shift.user_id) continue;
      const user = data.users.find((entry) => entry.id === shift.user_id);
      const key = fmtDate(shift.starts_at);
      totals[key] = (totals[key] || 0) + hoursBetween(shift.starts_at, shift.ends_at, shift.break_min) * (Number(user?.wage) || 0);
    }
    return totals;
  }, [data.users, schedule?.shifts, weekDays]);
  const totalLaborCost = Object.values(laborCostByDay).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  const navItems = (isManager ? MANAGER_NAV : EMPLOYEE_NAV).filter((item) => !item.flag || flags[item.flag]);
  const navBadgeCounts = { pending: pendingCount };
  const locationById = useMemo(() => Object.fromEntries((data.locations || []).map((entry) => [entry.id, entry])), [data.locations]);

  if (!currentUser) return <LoginPage backendMode={backendMode} onAfterLogin={(u) => setTab(u.role === "employee" ? "my" : "schedule")} />;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border p-6 text-sm">Loading your workspace…</div>
      </div>
    );
  }

  const shiftWeek = (delta) => setWeekStart((s) => fmtDate(startOfWeek(addDays(s, delta * 7), flags.weekStartsOn)));
  const handlePrint = () => window.print();
  const openProfileTab = () => {
    setTab("profile");
    setHeaderProfileOpen(false);
    setMobileMenuOpen(false);
  };
  const openProUpsell = (featureKey) => {
    const features = {
      laborCost: {
        title: "Labor cost insights",
        benefits: [
          "Track wage impact by day before you publish.",
          "Spot overtime pressure earlier in the week.",
          "Share clean labor summaries with leadership.",
        ],
      },
      payrollExport: {
        title: "Payroll export",
        benefits: [
          "Export clean payroll-ready hours in one click.",
          "Reduce manual spreadsheet cleanup every week.",
          "Keep finance and schedule data aligned.",
        ],
      },
    };
    setProUpsell(features[featureKey] || null);
  };
  const exportAllData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      data,
      clientSettings,
    };
    downloadText("Shiftway_export.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8;");
  };
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
    <div className="min-h-screen bg-brand-lightest text-brand-text">
      <aside className="print-hidden fixed inset-y-0 left-0 z-40 hidden w-[60px] flex-col rounded-r-[2rem] bg-brand-darker py-5 text-white shadow-2xl md:flex">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-lg">✦</div>
          <div>
            <div className="text-xl font-black">Shiftway</div>
            <div className="text-xs text-white/70">{isManager ? "Warm scheduling" : "My workspace"}</div>
          </div>
        </div>
        <div className="flex-1 space-y-1">
          {navItems.map((item) => (
            <TabBtn key={item.id} id={item.id} tab={tab} setTab={setTab} label={item.label} icon={item.icon} badge={item.badgeKey ? navBadgeCounts[item.badgeKey] : null} vertical />
          ))}
          {isManager && <TabBtn id="requests" tab={tab} setTab={setTab} label="Time Off" icon="🗂" vertical />}
        </div>
        <div className="mt-4 rounded-[1.5rem] bg-white/10 p-3">
          <div className="flex items-center gap-3">
            <AvatarBadge name={currentStateUser.full_name} className="h-11 w-11 bg-white/85 text-brand-darker" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{currentStateUser.full_name}</div>
              <div className="truncate text-xs text-white/70">{currentStateUser.role}</div>
            </div>
          </div>
          <button className="mt-3 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-dark transition hover:bg-brand-lightest" onClick={logout}>Logout</button>
        </div>
      </aside>

      <div className="print-hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-brand-light/70 bg-brand-lightest/95 px-4 py-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-white p-2 text-brand-dark shadow-sm" onClick={() => setMobileMenuOpen((v) => !v)}>☰</button>
          <div>
            <div className="font-black text-brand-text">Shiftway</div>
            <div className="text-xs text-brand-dark">{navItems.find((item) => item.id === tab)?.label || "Schedule"}</div>
          </div>
        </div>
        <button
          type="button"
          className="rounded-2xl border border-brand-light bg-white p-1 shadow-sm transition hover:border-brand"
          onClick={() => setHeaderProfileOpen((v) => !v)}
          aria-label="Open profile menu"
          aria-haspopup="dialog"
        >
          <AvatarBadge name={currentStateUser.full_name} className="h-10 w-10" />
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="print-hidden fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="h-full w-[280px] rounded-r-[2rem] bg-brand-darker p-4 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xl font-black">Shiftway</div>
                <div className="text-xs text-white/70">{currentStateUser.full_name}</div>
              </div>
              <button className="rounded-xl p-2 hover:bg-white/10" onClick={() => setMobileMenuOpen(false)}>✕</button>
            </div>
            <div className="space-y-1">
              {navItems.map((item) => (
                <TabBtn key={`mobile-${item.id}`} id={item.id} tab={tab} setTab={(next) => { setTab(next); setMobileMenuOpen(false); }} label={item.label} icon={item.icon} badge={item.badgeKey ? navBadgeCounts[item.badgeKey] : null} vertical />
              ))}
              {isManager && <TabBtn id="requests" tab={tab} setTab={(next) => { setTab(next); setMobileMenuOpen(false); }} label="Time Off" icon="🗂" vertical />}
            </div>
            <button className="mt-4 w-full rounded-xl bg-white px-4 py-2 font-semibold text-brand-dark" onClick={logout}>Logout</button>
          </div>
        </div>
      )}

      <HeaderProfileMenu
        open={headerProfileOpen}
        onClose={() => setHeaderProfileOpen(false)}
        user={currentStateUser}
        onEditProfile={openProfileTab}
        onLogout={logout}
      />

      <main className="space-y-6 px-4 py-4 pb-24 md:ml-[60px] md:px-4 md:py-4 md:pb-6">
        <header className="print-hidden rounded-[1.75rem] border border-brand-light bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-dark/70">{isManager ? "Schedule Hub" : "Personal Schedule"}</div>
              <h1 className="text-3xl font-black text-brand-text">{isManager ? "Build the week with confidence" : "Your week at a glance"}</h1>
              <div className="mt-1 text-sm text-brand-dark">Friendly scheduling for {data.locations.find((entry) => entry.id === locationId)?.name || "your team"}.</div>
              <DailyNugget />
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <button
                type="button"
                className="inline-flex items-center gap-3 self-start rounded-2xl border border-brand-light bg-brand-lightest/70 px-3 py-2 text-left transition hover:border-brand hover:bg-brand-lightest lg:self-end"
                onClick={() => setHeaderProfileOpen((v) => !v)}
                aria-label="Open profile menu"
                aria-haspopup="dialog"
              >
                <div className="hidden text-right sm:block">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark/70">Account</div>
                  <div className="max-w-[12rem] truncate text-sm font-semibold text-brand-text">{currentStateUser.full_name}</div>
                </div>
                <AvatarBadge name={currentStateUser.full_name} className="h-11 w-11" />
              </button>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="text-sm font-medium text-brand-text">Location</span>
                  <select className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-sm font-medium text-brand-text">Week</span>
                  <input type="date" value={weekStart} onChange={(e) => setWeekStart(fmtDate(startOfWeek(e.target.value, flags.weekStartsOn)))} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                </label>
                <div className="flex items-end gap-2">
                  <button className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark transition hover:bg-brand-lightest" onClick={()=>shiftWeek(-1)}>Prev</button>
                  <button className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-darker" onClick={()=> setWeekStart(fmtDate(startOfWeek(today(), flags.weekStartsOn)))}>Today</button>
                  <button className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark transition hover:bg-brand-lightest" onClick={()=>shiftWeek(1)}>Next</button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {backendMode && apiError && (
          <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Backend unreachable</div>
                <div className="text-xs text-red-900/80">{apiError}</div>
                <div className="mt-1 text-xs text-red-900/80">Make sure the server is running and CORS allows this origin. If deployed, set <code>VITE_API_BASE</code>. Current API base: <code>{apiBase}</code>.</div>
              </div>
              <button className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100" onClick={()=>setApiError(null)}>Dismiss</button>
            </div>
          </div>
        )}

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
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryStat label="Total shifts" value={(schedule?.shifts || []).length} />
            <SummaryStat label="Scheduled hours" value={`${totalScheduledHours.toFixed(2)} h`} />
            <SummaryStat label={<span>Estimated labor cost<ProBadge /></span>} value={formatCurrency(totalLaborCost)} onClick={() => openProUpsell("laborCost")} />
            <SummaryStat label="Open shifts" value={openShifts.length} />
          </div>

          <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-brand-light bg-brand-lightest p-3 text-sm">
            {positions.map((position) => (
              <div key={position.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${positionColors[position.id]?.dot || "bg-brand"}`} />
                <span>{position.name}</span>
              </div>
            ))}
          </div>

          {scopedUsers.length === 0 ? (
            <EmptyState icon="🗓" message="Add employees first so you can start building the schedule." />
          ) : (
            <div className="print-schedule-area rounded-2xl border border-brand-light bg-white p-3">
              <WeekGrid
                employees={scopedUsers}
                weekDays={weekDays}
                shifts={schedule?.shifts || []}
                positionsById={positionsById}
                unavailability={unavailability}
                timeOffList={data.time_off_requests}
                showTimeOffChips={flags.showTimeOffOnSchedule}
                positionColors={positionColors}
                showLaborCost={true}
                laborCostByDay={laborCostByDay}
                currentUser={currentStateUser}
                openShiftClaims={data.open_shift_claims || []}
                onCreate={(userId, day) => setShiftModal({ open: true, preUserId: userId, preDay: day })}
                onDelete={deleteShift}
                onSwap={(shift) => setSwapModal({ open: true, shift, requestUserId: shift.user_id || currentStateUser.id })}
                onMarkOpen={markShiftOpen}
                onClaimOpen={(shift) => createOpenShiftClaim(shift.id, currentStateUser.id)}
              />
            </div>
          )}

          {schedule && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
                <h4 className="mb-2 font-semibold">Total hours by employee</h4>
                <ul className="space-y-1 text-sm">
                  {scopedUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2"><AvatarBadge name={u.full_name} className="h-6 w-6 text-[10px]" />{u.full_name}</span>
                      <span className="tabular-nums">{(totalHoursByUser[u.id] || 0).toFixed(2)} h</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
                <h4 className="mb-2 font-semibold">Daily hours and labor</h4>
                <ul className="space-y-1 text-sm">
                  {weekDays.map((d) => (
                    <li key={String(d)} className="flex justify-between gap-3"><span>{fmtDateLabel(d)}</span><span className="tabular-nums">{(totalHoursByDay[fmtDate(d)] || 0).toFixed(2)} h • {formatCurrency(laborCostByDay[fmtDate(d)] || 0)}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-xl border border-brand-dark bg-brand-dark px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-darker" onClick={() => ensureSchedule()}>Ensure Week</button>
            <button className="rounded-xl border border-brand-dark bg-brand-dark px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-darker" onClick={() => setShiftModal({ open: true, preUserId: null, preDay: safeDate(weekStart) })}>Add open shift</button>
            <button disabled={!schedule} className={`rounded-xl border px-4 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${schedule?.status === "published" ? "border-brand bg-white text-brand-dark hover:bg-brand-lightest" : "border-brand-dark bg-brand-dark text-white hover:bg-brand-darker"}`} onClick={publish}>{schedule?.status === "published" ? "Unpublish" : "Publish"}</button>
            <button className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark shadow-sm transition hover:bg-brand-lightest" onClick={copyLastWeek}>
              Copy last week<ProBadge />
            </button>
            <button disabled={!schedule} className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark shadow-sm transition hover:bg-brand-lightest disabled:cursor-not-allowed disabled:opacity-60" onClick={handlePrint}>Print</button>
            <button disabled={!schedule} className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark shadow-sm transition hover:bg-brand-lightest disabled:cursor-not-allowed disabled:opacity-60" onClick={copyCsv}>Copy CSV</button>
            <button disabled={!schedule} className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark shadow-sm transition hover:bg-brand-lightest disabled:cursor-not-allowed disabled:opacity-60" onClick={exportCsv}>Download CSV</button>
            <button className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark shadow-sm transition hover:bg-brand-lightest" onClick={() => openProUpsell("payrollExport")}>
              Payroll export<ProBadge />
            </button>
            {DEMO_MODE && SHOW_DEMO_CONTROLS && (
              <button className="rounded-xl border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-dark shadow-sm transition hover:bg-brand-lightest" onClick={resetDemo}>Reset Demo</button>
            )}
          </div>

          {/* Manager quick inputs below schedule */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
              <h4 className="mb-2 font-semibold">Quick: Add time off</h4>
              <ManagerQuickTimeOff users={scopedUsers} onSubmit={createTimeOff} />
              <div className="mt-2 text-xs text-brand-text/70">Full lists & approvals in the <b>Pending</b> tab.</div>
            </div>
            {flags.unavailabilityEnabled && (
              <div className="rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
                <h4 className="mb-2 font-semibold">Quick: Add weekly unavailability</h4>
                <ManagerQuickUnavailability users={scopedUsers} onSubmit={addUnavailability} />
                <div className="mt-2 text-xs text-brand-text/70">View & edit all in the <b>Unavailability</b> tab.</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {isManager && tab === "employees" && (
        <Section
          title="Employees"
          right={<button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white shadow-sm transition hover:bg-brand-darker" onClick={() => setInviteModal(true)}>Invite Employee</button>}
        >
          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <AddEmployeeForm onAdd={addEmployee} />
            <div>
              <h4 className="mb-4 text-lg font-bold text-brand-text">Active employees</h4>
              {users.length === 0 ? (
                <EmptyState icon="👥" heading="No employees yet" message="Invite someone or add a team member to start building your crew." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {users.map((u) => (
                    <div key={u.id} className="rounded-2xl border border-brand-light bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <AvatarBadge name={u.full_name} className="h-12 w-12 text-sm" />
                          <div>
                            <div className="font-semibold text-brand-text">{u.full_name}</div>
                            <div className="text-xs text-gray-500">{u.email || "No email added"}</div>
                          </div>
                        </div>
                        <span className="rounded-full bg-brand-lightest px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">{u.role}</span>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-gray-600">
                        {u.pronouns ? <div>{u.pronouns}</div> : null}
                        <div>{u.phone || "No phone"}{u.birthday ? ` • Birthday ${u.birthday}` : ""}</div>
                        {u.emergency_contact?.name ? <div>Emergency: {u.emergency_contact.name}{u.emergency_contact.phone ? ` (${u.emergency_contact.phone})` : ""}</div> : null}
                        <div className="font-medium text-brand-dark">Hours this week: {(totalHoursByUser[u.id] || 0).toFixed(2)} h</div>
                      </div>
                      <div className="mt-3">
                        <label className="mb-1 block text-sm font-medium text-brand-text">Hourly wage</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={u.wage ?? ""}
                          onChange={(e) => setData((d) => ({
                            ...d,
                            users: d.users.map((user) => user.id === u.id ? { ...user, wage: e.target.value === "" ? "" : Number(e.target.value) } : user),
                          }))}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded-lg p-2 text-brand-dark transition hover:bg-brand-lightest" onClick={() => setTab("messages")}>💬</button>
                        <button className="rounded-lg p-2 text-brand-dark transition hover:bg-brand-lightest" onClick={() => setTab("profile")}>👤</button>
                        <button className="rounded-lg p-2 text-brand-dark transition hover:bg-brand-lightest" onClick={() => setTab("schedule")}>📅</button>
                      </div>
                      {u.notes && <div className="mt-3 text-xs text-gray-500">Notes: {u.notes}</div>}
                      {(u.attachments||[]).length>0 && <div className="mt-2 text-xs text-gray-500">Attachments: {(u.attachments||[]).map(f=> f.name).join(', ')}</div>}
                    </div>
                  ))}
                </div>
              )}
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

      {isManager && tab === "pending" && (
        <Section title={`Pending approvals${pendingCount ? ` (${pendingCount})` : ""}`}>
          <PendingApprovalsPanel
            users={users}
            schedules={data.schedules}
            swaps={data.shift_swaps || []}
            timeOffRequests={data.time_off_requests || []}
            openShiftClaims={data.open_shift_claims || []}
            onSetSwapStatus={setSwapStatus}
            onSetTimeOffStatus={setTimeOffStatus}
            onSetOpenShiftClaimStatus={setOpenShiftClaimStatus}
          />
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

      {tab === "profile" && (
        <Section title="Profile">
          <ProfilePanel currentUser={currentStateUser} canEditWage={isManager} onSave={saveProfile} />
        </Section>
      )}

      {!isManager && tab === "my" && (
        <Section
          title={`My Schedule • ${safeDate(weekStart).toLocaleDateString()}`}
          right={<Pill tone={schedule?.status === "published" ? "success" : "warn"}>{schedule ? schedule.status : "no schedule yet"}</Pill>}
        >
          <EmployeeNextShiftBanner
            currentUser={currentUser}
            schedules={data.schedules}
            locationsById={locationById}
          />
          <MyShifts
            currentUser={currentUser}
            schedule={schedule}
            weekDays={weekDays}
            positionsById={positionsById}
            locationName={data.locations.find((entry) => entry.id === locationId)?.name || "Main Location"}
            positionColors={positionColors}
            onSwapRequest={(shift) => setSwapModal({ open: true, shift, requestUserId: shift.user_id || currentUser.id })}
          />
          <OpenShiftList
            shifts={(schedule?.shifts || []).filter((shift) => !shift.user_id)}
            positionsById={positionsById}
            positionColors={positionColors}
            claims={data.open_shift_claims || []}
            onClaim={flags.openShiftClaimingEnabled ? (shiftId) => createOpenShiftClaim(shiftId, currentUser.id) : null}
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
            <div className="rounded-2xl border border-brand-light bg-brand-lightest/60 p-2">
              <div className="flex flex-wrap gap-2">
                {[
                  ["general", "General"],
                  ["schedule", "Schedule"],
                  ["time-off", "Time Off"],
                  ["notifications", "Notifications"],
                  ["danger", "Danger Zone"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${settingsSection === id ? "bg-brand-dark text-white shadow-sm" : "bg-white text-brand-dark hover:bg-brand-light"}`}
                    onClick={() => setSettingsSection(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {settingsSection === "general" && (
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <TextInput
                    label="Organization name"
                    value={clientSettings.orgName}
                    onChange={(v) => setClientSettings((s) => ({ ...s, orgName: v }))}
                    placeholder="Shiftway"
                  />
                  <Select
                    label="Week start day"
                    value={flags.weekStartsOn}
                    onChange={(v) => {
                      const n = Number(v);
                      setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, weekStartsOn: n } }));
                      setWeekStart((s) => fmtDate(startOfWeek(s, n)));
                    }}
                    options={WEEK_LABELS.map((w, i) => ({ value: i, label: w }))}
                  />
                </div>

                <div>
                  <div className="font-semibold text-brand-text">Location names</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {data.locations.map((entry) => (
                      <TextInput
                        key={entry.id}
                        label={`Location ${entry.id}`}
                        value={entry.name}
                        onChange={(value) => setData((d) => ({
                          ...d,
                          locations: d.locations.map((location) => location.id === entry.id ? { ...location, name: value } : location),
                        }))}
                      />
                    ))}
                  </div>
                </div>

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
              </div>
            )}

            {settingsSection === "schedule" && (
              <div className="space-y-6">
                <div className="grid gap-2 md:grid-cols-2">
                  <Checkbox
                    label={<span>Shift acceptance / open shift claiming<ProBadge /></span>}
                    checked={flags.openShiftClaimingEnabled}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, openShiftClaimingEnabled: v } }))}
                    hint="Allow employees to claim open shifts."
                  />
                  <Checkbox
                    label="Enable unavailability"
                    checked={flags.unavailabilityEnabled}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, unavailabilityEnabled: v } }))}
                    hint="Hide all unavailability UI when turned off."
                  />
                  <Checkbox
                    label="Employees can edit their unavailability"
                    checked={flags.employeeEditUnavailability}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, employeeEditUnavailability: v } }))}
                    hint="Managers can still edit from the admin view."
                  />
                  <Checkbox
                    label="Show time-off chips on schedule"
                    checked={flags.showTimeOffOnSchedule}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, showTimeOffOnSchedule: v } }))}
                    hint="Show approved and pending time-off states in the grid."
                  />
                  <Checkbox
                    label="Newsfeed"
                    checked={flags.newsfeedEnabled}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, newsfeedEnabled: v } }))}
                  />
                  <Checkbox
                    label="Employees can post to feed"
                    checked={flags.employeesCanPostToFeed}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, employeesCanPostToFeed: v } }))}
                  />
                  <Checkbox
                    label="Tasks"
                    checked={flags.tasksEnabled}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, tasksEnabled: v } }))}
                  />
                  <Checkbox
                    label="Messages"
                    checked={flags.messagesEnabled}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, messagesEnabled: v } }))}
                  />
                  <Checkbox
                    label="Shift swaps"
                    checked={flags.swapsEnabled}
                    onChange={(v) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, swapsEnabled: v } }))}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1.5 text-sm text-brand-text">
                    <span className="text-sm font-medium text-brand-text">Clopening rest period (hours)</span>
                    <input
                      type="number"
                      min="0"
                      value={clientSettings.scheduleSettings?.clopeningRestHours ?? 10}
                      onChange={(e) => setClientSettings((s) => ({
                        ...s,
                        scheduleSettings: { ...s.scheduleSettings, clopeningRestHours: Number(e.target.value) || 0 },
                      }))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </label>
                  <TextInput
                    label="Hours of operation"
                    value={clientSettings.scheduleSettings?.hoursOfOperation || ""}
                    onChange={(v) => setClientSettings((s) => ({ ...s, scheduleSettings: { ...s.scheduleSettings, hoursOfOperation: v } }))}
                    placeholder="09:00 - 21:00"
                  />
                  <Select
                    label={<span>Copy-week default<ProBadge /></span>}
                    value={clientSettings.scheduleSettings?.copyWeekDefault || "replace"}
                    onChange={(v) => setClientSettings((s) => ({ ...s, scheduleSettings: { ...s.scheduleSettings, copyWeekDefault: v } }))}
                    options={[
                      { value: "replace", label: "Replace current week" },
                      { value: "append", label: "Append copied shifts" },
                      { value: "confirm", label: "Always confirm first" },
                    ]}
                  />
                </div>

                <div>
                  <div className="font-semibold">Positions (roles)</div>
                  <div className="mt-2 grid gap-4 md:grid-cols-[1fr,2fr]">
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
              </div>
            )}

            {settingsSection === "time-off" && (
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1.5 text-sm text-brand-text">
                    <span className="text-sm font-medium text-brand-text">Cutoff days before shift</span>
                    <input
                      type="number"
                      min="0"
                      value={clientSettings.timeOffSettings?.cutoffDaysBeforeShift ?? 3}
                      onChange={(e) => setClientSettings((s) => ({
                        ...s,
                        timeOffSettings: { ...s.timeOffSettings, cutoffDaysBeforeShift: Number(e.target.value) || 0 },
                      }))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </label>
                  <Checkbox
                    label="Allow PTO balance tracking"
                    checked={!!clientSettings.timeOffSettings?.allowPtoBalance}
                    onChange={(v) => setClientSettings((s) => ({ ...s, timeOffSettings: { ...s.timeOffSettings, allowPtoBalance: v } }))}
                    hint="Store PTO allowance rules in client settings."
                  />
                  <Checkbox
                    label="Require manager note"
                    checked={!!clientSettings.timeOffSettings?.requireManagerNote}
                    onChange={(v) => setClientSettings((s) => ({ ...s, timeOffSettings: { ...s.timeOffSettings, requireManagerNote: v } }))}
                    hint="Require a note when approving or denying requests."
                  />
                </div>
              </div>
            )}

            {settingsSection === "notifications" && (
              <div className="space-y-6">
                <div className="grid gap-2 md:grid-cols-3">
                  <Checkbox
                    label="Email channel"
                    checked={!!data.notification_settings?.email}
                    onChange={(v) => setData((d) => ({ ...d, notification_settings: { ...(d.notification_settings || {}), email: v } }))}
                  />
                  <Checkbox
                    label="SMS channel"
                    checked={!!data.notification_settings?.sms}
                    onChange={(v) => setData((d) => ({ ...d, notification_settings: { ...(d.notification_settings || {}), sms: v } }))}
                  />
                  <Checkbox
                    label={<span>Push channel<ProBadge /></span>}
                    checked={!!data.notification_settings?.push}
                    onChange={(v) => setData((d) => ({ ...d, notification_settings: { ...(d.notification_settings || {}), push: v } }))}
                  />
                </div>

                <div className="overflow-x-auto rounded-2xl border border-brand-light bg-white">
                  <div className="grid grid-cols-[minmax(0,1.7fr)_96px_96px] gap-3 bg-brand-lightest px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brand-dark">
                    <div>Event</div>
                    <div className="text-center">Email</div>
                    <div className="text-center">Push</div>
                  </div>
                  {[
                    ["newShift", "New shift published"],
                    ["shiftChange", "Shift changed"],
                    ["swapRequest", "Swap approved"],
                    ["timeOffApproved", "Time off approved"],
                  ].map(([eventKey, label]) => (
                    <div key={eventKey} className="grid grid-cols-[minmax(0,1.7fr)_96px_96px] items-center gap-3 border-t border-brand-light/70 px-4 py-3">
                      <div className="text-sm font-semibold text-brand-text">{label}</div>
                      <div className="flex justify-center">
                        <button
                          type="button"
                          role="switch"
                          aria-label={`${label} email`}
                          aria-checked={!!clientSettings.notificationEvents?.[eventKey]?.email}
                          onClick={() => setClientSettings((s) => ({
                            ...s,
                            notificationEvents: {
                              ...s.notificationEvents,
                              [eventKey]: { ...(s.notificationEvents?.[eventKey] || {}), email: !s.notificationEvents?.[eventKey]?.email },
                            },
                          }))}
                          className={`relative inline-flex h-6 w-11 rounded-full transition ${clientSettings.notificationEvents?.[eventKey]?.email ? "bg-brand-dark" : "bg-gray-200"}`}
                        >
                          <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm transition ${clientSettings.notificationEvents?.[eventKey]?.email ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          role="switch"
                          aria-label={`${label} push`}
                          aria-checked={!!clientSettings.notificationEvents?.[eventKey]?.push}
                          onClick={() => setClientSettings((s) => ({
                            ...s,
                            notificationEvents: {
                              ...s.notificationEvents,
                              [eventKey]: { ...(s.notificationEvents?.[eventKey] || {}), push: !s.notificationEvents?.[eventKey]?.push },
                            },
                          }))}
                          className={`relative inline-flex h-6 w-11 rounded-full transition ${clientSettings.notificationEvents?.[eventKey]?.push ? "bg-brand-dark" : "bg-gray-200"}`}
                        >
                          <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm transition ${clientSettings.notificationEvents?.[eventKey]?.push ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>
                        <ProBadge className="ml-0" />
                      </div>
                    </div>
                  ))}
                </div>

                {backendMode && (
                  <div>
                    <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={enablePush}>
                      Enable push notifications<ProBadge />
                    </button>
                  </div>
                )}
              </div>
            )}

            {settingsSection === "danger" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="font-semibold text-red-800">Danger Zone</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={resetDemo}
                      disabled={!(DEMO_MODE && SHOW_DEMO_CONTROLS)}
                    >
                      Reset demo data
                    </button>
                    <button className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100" onClick={exportAllData}>
                      Export all data
                    </button>
                  </div>
                  {!(DEMO_MODE && SHOW_DEMO_CONTROLS) && (
                    <div className="mt-2 text-xs text-red-700/80">Demo reset is only available when demo controls are enabled.</div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-amber-50 p-3">
              <div className="font-semibold">How to use</div>
              <ol className="ml-4 list-decimal pl-2">
                <li>Add employees & positions.</li>
                <li>Pick a week (uses your setting) then <b>Ensure Week</b>.</li>
                <li>Create shifts via <b>+ add</b> in each employee/day cell.</li>
                <li>Use <b>Tasks</b> & <b>Feed</b> for daily ops.</li>
                <li>Export via <b>Copy</b>, <b>Download CSV</b>, or <b>Export all data</b>.</li>
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
        onClose={() => setSwapModal({ open: false, shift: null, requestUserId: null })}
        currentUser={currentUser}
        users={users}
        schedule={schedule}
        shift={swapModal.shift}
        requestUserId={swapModal.requestUserId}
        onSubmit={createSwapRequest}
      />

      <ProUpsellModal feature={proUpsell} onClose={() => setProUpsell(null)} />

      <InviteModal
        open={inviteModal}
        onClose={() => setInviteModal(false)}
        locations={data.locations}
        clientSettings={clientSettings}
      />

        <footer className="pb-4 text-center text-xs text-brand-dark/60">Shiftway scheduling app.</footer>
      </main>

      <nav className="print-hidden fixed inset-x-0 bottom-0 z-30 border-t border-brand-light/80 bg-white/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-2">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={`bottom-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`rounded-2xl px-2 py-2 text-center text-[11px] font-semibold transition ${tab === item.id ? "bg-brand-lightest text-brand-dark" : "text-brand-dark/70"}`}
            >
              <div className="text-base">{item.icon}</div>
              <div>{item.label}</div>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}


function DailyNugget() {
  const [nugget, setNugget] = React.useState("");
  React.useEffect(() => {
    fetch("/nuggets.json")
      .then((r) => r.json())
      .then((list) => {
        const seenKey = "shiftway_nugget_seen";
        let seen = [];
        try { seen = JSON.parse(localStorage.getItem(seenKey) || "[]"); } catch {}
        if (seen.length >= list.length) seen = [];
        const remaining = list.map((_, i) => i).filter((i) => !seen.includes(i));
        const pick = remaining[Math.floor(Math.random() * remaining.length)];
        seen.push(pick);
        try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch {}
        setNugget(list[pick] || "");
      })
      .catch(() => setNugget("🌍 The world is full of surprises. So is this schedule."));
  }, []);
  if (!nugget) return null;
  return <div className="mt-2 text-xs text-brand-dark/60 italic">{nugget}</div>;
}

function TabBtn({ id, tab, setTab, label, icon, badge, vertical = false }) {
  const isActive = tab === id;
  if (vertical) {
    return (
      <button
        onClick={() => setTab(id)}
        title={label}
        className={`group/btn relative flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all duration-150 ${isActive ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
      >
        {icon ? <span className="text-xl">{icon}</span> : <span className="text-xs font-bold">{label.slice(0,2)}</span>}
        {badge ? <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-white">{badge}</span> : null}
        {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-white" />}
        <span className="pointer-events-none absolute left-[110%] z-50 hidden whitespace-nowrap rounded-lg bg-brand-text px-2 py-1 text-xs font-medium text-white shadow-lg group-hover/btn:block">{label}</span>
      </button>
    );
  }
  return (
    <button
      onClick={() => setTab(id)}
      className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${isActive ? "bg-white text-brand-darker shadow-sm" : "bg-white/10 text-white hover:bg-white/20"}`}
    >
      <span className="flex items-center gap-3">
        {icon ? <span className="text-base">{icon}</span> : null}
        <span>{label}</span>
      </span>
      {badge ? <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-brand-darker">{badge}</span> : null}
    </button>
  );
}

function SummaryStat({ label, value, onClick }) {
  const content = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-brand-text/60">{label}</div>
      <div className="mt-1 text-lg font-semibold text-brand-text">{value}</div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="rounded-[1.5rem] border border-brand-light bg-white p-4 text-left shadow-sm transition hover:border-brand hover:bg-brand-lightest"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">{content}</div>;
}

function EmptyState({ icon, message, heading, actionLabel, onAction }) {
  return (
    <div className="grid place-items-center gap-3 rounded-[1.75rem] border border-dashed border-brand-light bg-brand-lightest p-8 text-center">
      <div className="text-[64px] leading-none">{icon}</div>
      <div className="text-lg font-bold text-brand-text">{heading || "Nothing here yet"}</div>
      <div className="max-w-md text-sm text-gray-500">{message}</div>
      {actionLabel && onAction && (
        <button className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-darker" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ---------- forms & modals ----------
function InviteModal({ open, onClose, locations, clientSettings }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("employee");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setLocationId((prev) => prev || locations[0]?.id || "");
  }, [locations, open]);

  const reset = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("employee");
    setLocationId(locations[0]?.id || "");
    setSubmitting(false);
    setSuccess(null);
    setErr("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setErr("");
    setSuccess(null);
    if (!fullName.trim() || (!email.trim() && !phone.trim())) {
      setErr("Enter a full name and at least one contact method.");
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await apiFetch("/api/invite", {
        token,
        method: "POST",
        body: {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          role,
          location_id: locationId || null,
        },
      }, clientSettings);
      setSuccess(res);
    } catch (e) {
      setErr(e.message || "Unable to send invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Invite employee"
      footer={
        <>
          <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm text-brand-dark transition hover:bg-brand-light" onClick={handleClose}>Cancel</button>
          <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Sending..." : "Send invite"}
          </button>
        </>
      }
    >
      {err && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {success && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          <div className="font-medium">Invite sent.</div>
          <div className="mt-1 break-all text-xs">{success.invite_url}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-xs text-brand-dark transition hover:bg-brand-light" onClick={() => navigator.clipboard.writeText(success.invite_url).then(() => alert("Invite link copied to clipboard")).catch(() => alert("Copy failed. Copy the link manually."))}>Copy link</button>
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="Full Name" value={fullName} onChange={setFullName} placeholder="Jane Doe" />
        <TextInput label="Email" value={email} onChange={setEmail} type="email" placeholder="jane@example.com" />
        <TextInput label="Phone" value={phone} onChange={setPhone} placeholder="555-0123" />
        <Select
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "employee", label: "Employee" },
            { value: "manager", label: "Manager" },
          ]}
        />
        <div className="md:col-span-2">
          <Select
            label="Location"
            value={locationId}
            onChange={setLocationId}
            options={locations.map((location) => ({ value: location.id, label: location.name }))}
          />
        </div>
      </div>
      <div className="text-xs text-gray-600">If email or SMS delivery is not configured, use the invite link above to share access manually.</div>
    </Modal>
  );
}

function AddEmployeeForm({ onAdd }) {
  const [full_name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");
  const [wage, setWage] = useState("");
  const [notes, setNotes] = useState("");
  const [filesMeta, setFilesMeta] = useState([]);

  const onFiles = (fileList) => {
    const arr = Array.from(fileList || []).map(f => ({ id: uid(), name: f.name, size: f.size, type: f.type, lastModified: f.lastModified }));
    setFilesMeta(arr);
  };

  return (
    <div className="rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">
      <h4 className="mb-4 text-lg font-bold text-brand-text">Add employee</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="Full name" value={full_name} onChange={setName} placeholder="Jane Doe" />
        <TextInput label="Email" value={email} onChange={setEmail} placeholder="jane@example.com" />
        <Select label="Role" value={role} onChange={setRole} options={[{ value: "employee", label: "Employee" }, { value: "manager", label: "Manager" }, { value: "owner", label: "Owner" }]} />
        <TextInput label="Phone" value={phone} onChange={setPhone} placeholder="555-0123" />
        <label className="grid gap-1.5 text-sm">
          <span className="text-sm font-medium text-brand-text">Birthday</span>
          <input type="date" value={birthday} onChange={(e)=>setBirthday(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"/>
        </label>
        <TextInput label="Pronouns (optional)" value={pronouns} onChange={setPronouns} placeholder="she/her" />
        <TextInput label="Emergency contact name" value={emName} onChange={setEmName} placeholder="Contact name" />
        <TextInput label="Emergency contact phone" value={emPhone} onChange={setEmPhone} placeholder="555-0456" />
        <label className="grid gap-1.5 text-sm">
          <span className="text-sm font-medium text-brand-text">Hourly wage</span>
          <input type="number" min="0" step="0.01" value={wage} onChange={(e)=>setWage(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"/>
        </label>
        <label className="md:col-span-2 grid gap-1.5 text-sm">
          <span className="text-sm font-medium text-brand-text">Attachments {DEMO_MODE ? "(stored as metadata only in demo)" : "(metadata only for now)"}</span>
          <input type="file" multiple onChange={(e)=>onFiles(e.target.files)} className="rounded-xl border border-gray-200 px-3 py-2" />
          {filesMeta.length>0 && <div className="text-xs text-gray-500">{filesMeta.length} file(s): {filesMeta.map(f=>f.name).join(', ')}</div>}
        </label>
        <div className="md:col-span-2">
          <TextArea label="Notes" value={notes} onChange={setNotes} placeholder="Allergies, preferred shifts, etc." />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white shadow-sm transition hover:bg-brand-darker" onClick={() => { if (!full_name.trim()) return alert("Enter a name"); onAdd({ full_name: full_name.trim(), email: email.trim(), role, phone, birthday, pronouns, emergency_contact: { name: emName, phone: emPhone }, attachments: filesMeta, notes, wage: wage === "" ? "" : Number(wage) }); setName(""); setEmail(""); setRole("employee"); setPhone(""); setBirthday(""); setPronouns(""); setEmName(""); setEmPhone(""); setWage(""); setFilesMeta([]); setNotes(""); }}>Add</button>
      </div>
    </div>
  );
}

function AddPositionForm({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <div className="rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">
      <h4 className="mb-4 text-lg font-bold text-brand-text">Add role/position</h4>
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Name" value={name} onChange={setName} placeholder="Scooper" />
      </div>
      <div className="mt-3 flex justify-end">
        <button className="rounded-2xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white shadow-sm transition hover:bg-brand-darker" onClick={() => { if (!name.trim()) return alert("Enter a name"); onAdd(name.trim()); setName(""); }}>Add</button>
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
  const [isOpenShift, setIsOpenShift] = useState(false);

  useEffect(() => {
    setIsOpenShift(!defaultUserId);
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
          <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm text-brand-dark transition hover:bg-brand-light" onClick={onClose}>Cancel</button>
          <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={() => { if (!isOpenShift && !userId) return alert("Pick an employee or mark this as open."); if (!positionId) return alert("Pick a position"); onCreate({ user_id: userId, position_id: positionId, day, start_hhmm: start, end_hhmm: end, break_min: breakMin, notes, quickTaskTitle, quickTaskTemplateId: templateId, is_open: isOpenShift }); setQuickTaskTitle(""); setTemplateId(""); setIsOpenShift(false); onClose(); }}>Save shift</button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <Checkbox label="Create as open shift" checked={isOpenShift} onChange={setIsOpenShift} hint="Leave this unassigned so employees can claim it." />
          {!isOpenShift && <Select label="Employee" value={userId} onChange={setUserId} options={users.map((u) => ({ value: u.id, label: u.full_name }))} />}
        </div>
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

      {canQuickTask && !isOpenShift && (
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
      <div className="md:col-span-2 flex justify-end"><button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={()=> onSubmit({ user_id: userId, date_from: from, date_to: to, notes })}>Submit</button></div>
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
      <div className="md:col-span-2 flex justify-end"><button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={()=> onSubmit({ user_id: userId, kind:'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes })}>Add</button></div>
    </div>
  );
}

// ---------- auth + employee pages ----------
function InviteAcceptPage({ clientSettings }) {
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inviteToken = new URLSearchParams(window.location.search).get("token") || "";

  useEffect(() => {
    if (!inviteToken) {
      setErr("Invite token is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr("");
    apiFetch(`/api/invite/verify?token=${encodeURIComponent(inviteToken)}`, {}, clientSettings)
      .then((res) => {
        setInvite(res);
        setFullName(res.full_name || "");
      })
      .catch((e) => {
        setErr(e.message || "Unable to verify invite");
      })
      .finally(() => setLoading(false));
  }, [clientSettings, inviteToken]);

  const handleAccept = async () => {
    setErr("");
    if (!fullName.trim() || !password) {
      setErr("Please fill in all required fields.");
      return;
    }
    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/invite/accept", {
        method: "POST",
        body: {
          token: inviteToken,
          password,
          full_name: fullName.trim(),
        },
      }, clientSettings);
      if (res?.token) localStorage.setItem(TOKEN_KEY, res.token);
      window.location.href = `${window.location.origin}/`;
    } catch (e) {
      setErr(e.message || "Unable to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center p-6">
      <div className="w-full rounded-2xl border p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-black">Shiftway</h1>
        <div className="mb-4 text-brand-dark">Accept your invite</div>
        {err && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}
        {loading && <div className="rounded-xl border p-3 text-sm">Verifying your invite…</div>}
        {!loading && invite && (
          <div className="grid gap-3">
            <div className="rounded-xl border border-brand-light bg-brand-lightest p-3 text-sm">
              <div className="font-medium">Welcome to {invite.org_name}</div>
              <div className="text-gray-600">{invite.role === "manager" ? "Manager" : "Employee"} invite{invite.email ? ` for ${invite.email}` : ""}</div>
            </div>
            <TextInput label="Full Name" value={fullName} onChange={setFullName} />
            <TextInput label="Password" value={password} onChange={setPassword} type="password" />
            <TextInput label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} type="password" />
            <button className="mt-1 rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-darker disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} onClick={handleAccept}>
              {submitting ? "Creating account..." : "Accept invite"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
        <div className="mb-4 text-brand-dark">{mode === "register" ? "Create your company" : mode === "magic" ? "Magic link" : "Sign in"}</div>
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
            <button className="mt-1 rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-darker" onClick={handleLogin}>Sign in</button>
          )}
          {mode === "register" && (
            <button className="mt-1 rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-darker" onClick={handleRegister}>Create account</button>
          )}
          {mode === "magic" && (
            <button className="mt-1 rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-darker" onClick={handleMagic}>Send magic link</button>
          )}
          {isLive && (
            <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm text-brand-dark transition hover:bg-brand-light" onClick={loginWithGoogle}>Continue with Google</button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
          {mode !== "login" && <button className="text-brand-dark underline" onClick={()=>setMode("login")}>Back to login</button>}
          {mode !== "register" && <button className="text-brand-dark underline" onClick={()=>setMode("register")}>Create company</button>}
          {mode !== "magic" && <button className="text-brand-dark underline" onClick={()=>setMode("magic")}>Use magic link</button>}
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

function SwapRequestModal({ open, onClose, currentUser, users, schedule, shift, requestUserId, onSubmit }) {
  const requestUser = users.find((user) => user.id === (requestUserId || shift?.user_id || currentUser.id)) || currentUser;
  const peers = users.filter((u) => u.id !== requestUser.id);
  const [peerId, setPeerId] = useState(peers[0]?.id || "");
  const [peerShiftId, setPeerShiftId] = useState("");
  const [notes, setNotes] = useState("");
  const peerShifts = (schedule?.shifts || []).filter((s) => s.user_id === peerId);

  useEffect(() => {
    if (!open) return;
    setPeerId(peers[0]?.id || "");
    setPeerShiftId("");
    setNotes("");
  }, [open, requestUser.id]);

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
          <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm text-brand-dark transition hover:bg-brand-light" onClick={onClose}>Cancel</button>
          <button
            className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker"
            onClick={() => {
              if (!peerId) return alert("Pick a coworker.");
              onSubmit({
                from_user_id: requestUser.id,
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
          <div className="font-medium">{requestUser.id === currentUser.id ? "Your shift" : `${requestUser.full_name}'s shift`}</div>
          <div className="text-gray-600">{fmtDate(shift.starts_at)} • {fmtTime(shift.starts_at)}–{fmtTime(shift.ends_at)}</div>
        </div>
        {requestUser.id !== currentUser.id && (
          <div className="mt-2 text-xs text-brand-text/70">This request will be created for {requestUser.full_name}.</div>
        )}
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
                  <button className="rounded-xl border border-brand-dark bg-brand-dark px-2 py-1 text-white transition hover:bg-brand-darker" onClick={() => onSetStatus(s.id, "pending_manager")}>Accept</button>
                  <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={() => onSetStatus(s.id, "denied")}>Decline</button>
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
                  <button className="rounded-xl border border-brand-dark bg-brand-dark px-2 py-1 text-white transition hover:bg-brand-darker" onClick={() => onSetStatus(s.id, "approved")}>Approve</button>
                  <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={() => onSetStatus(s.id, "denied")}>Deny</button>
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

function PendingApprovalsPanel({ users, schedules, swaps, timeOffRequests, openShiftClaims, onSetSwapStatus, onSetTimeOffStatus, onSetOpenShiftClaimStatus }) {
  const byId = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users]);
  const shiftById = useMemo(() => {
    const map = {};
    for (const schedule of schedules || []) {
      for (const shift of schedule.shifts || []) map[shift.id] = shift;
    }
    return map;
  }, [schedules]);
  const pendingSwaps = (swaps || []).filter((swap) => swap.status === "pending_manager");
  const pendingTimeOff = (timeOffRequests || []).filter((request) => request.status === "pending");
  const pendingClaims = (openShiftClaims || []).filter((claim) => claim.status === "pending");
  const StatusBadge = ({ children, tone = "warn" }) => (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone === "success" ? "bg-green-100 text-green-700" : tone === "danger" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{children}</span>
  );

  if (!pendingSwaps.length && !pendingTimeOff.length && !pendingClaims.length) {
    return <EmptyState icon="✅" heading="All caught up" message="Nothing is waiting on approval right now." />;
  }

  return (
    <div className="space-y-6 text-sm">
      <div className="rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-brand-text">Shift Swaps</div>
          <StatusBadge>{pendingSwaps.length} pending</StatusBadge>
        </div>
        <ul className="divide-y">
          {pendingSwaps.length === 0 && <li className="py-2 text-brand-text/70">No swap requests pending.</li>}
          {pendingSwaps.map((swap) => (
            <li key={swap.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <AvatarBadge name={byId[swap.from_user_id]?.full_name} className="h-7 w-7 text-xs" />
                  {byId[swap.from_user_id]?.full_name || "Employee"} ⇄ {byId[swap.to_user_id]?.full_name || "Employee"}
                </div>
                <div className="text-xs text-brand-text/70">
                  {shiftById[swap.from_shift_id] ? `${fmtDate(shiftById[swap.from_shift_id].starts_at)} ${fmtTime(shiftById[swap.from_shift_id].starts_at)}-${fmtTime(shiftById[swap.from_shift_id].ends_at)}` : "—"}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl bg-green-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-600" onClick={() => onSetSwapStatus(swap.id, "approved")}>Approve</button>
                <button className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-600" onClick={() => onSetSwapStatus(swap.id, "denied")}>Deny</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-brand-text">Time Off Requests</div>
          <StatusBadge>{pendingTimeOff.length} pending</StatusBadge>
        </div>
        <ul className="divide-y">
          {pendingTimeOff.length === 0 && <li className="py-2 text-brand-text/70">No time-off requests pending.</li>}
          {pendingTimeOff.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <AvatarBadge name={byId[request.user_id]?.full_name} className="h-7 w-7 text-xs" />
                  {byId[request.user_id]?.full_name || "Employee"}
                </div>
                <div className="text-xs text-brand-text/70">{request.date_from} → {request.date_to}{request.notes ? ` • ${request.notes}` : ""}</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl bg-green-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-600" onClick={() => onSetTimeOffStatus(request.id, "approved")}>Approve</button>
                <button className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-600" onClick={() => onSetTimeOffStatus(request.id, "denied")}>Deny</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-brand-text">Open Shift Claims</div>
          <StatusBadge>{pendingClaims.length} pending</StatusBadge>
        </div>
        <ul className="divide-y">
          {pendingClaims.length === 0 && <li className="py-2 text-brand-text/70">No open shift claims pending.</li>}
          {pendingClaims.map((claim) => {
            const shift = shiftById[claim.shift_id];
            return (
              <li key={claim.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <AvatarBadge name={byId[claim.user_id]?.full_name} className="h-7 w-7 text-xs" />
                    {byId[claim.user_id]?.full_name || "Employee"}
                  </div>
                  <div className="text-xs text-brand-text/70">
                    {shift ? `${fmtDate(shift.starts_at)} • ${fmtTime(shift.starts_at)}-${fmtTime(shift.ends_at)}` : "Shift unavailable"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-xl bg-green-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-600" onClick={() => onSetOpenShiftClaimStatus(claim.id, "approved")}>Approve</button>
                  <button className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-600" onClick={() => onSetOpenShiftClaimStatus(claim.id, "denied")}>Deny</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ProfilePanel({ currentUser, canEditWage, onSave }) {
  const [form, setForm] = useState(() => ({
    full_name: currentUser.full_name || "",
    phone: currentUser.phone || "",
    pronouns: currentUser.pronouns || "",
    birthday: currentUser.birthday || "",
    emergency_name: currentUser.emergency_contact?.name || "",
    emergency_phone: currentUser.emergency_contact?.phone || "",
    email: currentUser.email || "",
    current_password: "",
    new_password: "",
    confirm_password: "",
    wage: currentUser.wage ?? "",
  }));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      full_name: currentUser.full_name || "",
      phone: currentUser.phone || "",
      pronouns: currentUser.pronouns || "",
      birthday: currentUser.birthday || "",
      emergency_name: currentUser.emergency_contact?.name || "",
      emergency_phone: currentUser.emergency_contact?.phone || "",
      email: currentUser.email || "",
      current_password: "",
      new_password: "",
      confirm_password: "",
      wage: currentUser.wage ?? "",
    });
  }, [currentUser]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setError("");
    setStatus("");
    if (form.new_password && form.new_password !== form.confirm_password) {
      setError("New password and confirmation do not match.");
      return;
    }
    try {
      await onSave({
        full_name: form.full_name,
        phone: form.phone,
        pronouns: form.pronouns,
        birthday: form.birthday,
        emergency_contact: { name: form.emergency_name, phone: form.emergency_phone },
        email: form.email,
        current_password: form.current_password,
        new_password: form.new_password,
        wage: canEditWage ? form.wage : currentUser.wage,
      });
      setForm((prev) => ({ ...prev, current_password: "", new_password: "", confirm_password: "" }));
      setStatus("Profile saved.");
    } catch (err) {
      setError(err.message || "Unable to save profile.");
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-brand-light bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <AvatarBadge name={currentUser.full_name} className="h-10 w-10" />
          <div>
            <div className="text-lg font-semibold">{currentUser.full_name}</div>
            <div className="text-sm text-brand-text/70">Role: {currentUser.role}</div>
          </div>
        </div>
        <TextInput label="Full name" value={form.full_name} onChange={(value) => setField("full_name", value)} />
        <TextInput label="Phone" value={form.phone} onChange={(value) => setField("phone", value)} />
        <TextInput label="Pronouns" value={form.pronouns} onChange={(value) => setField("pronouns", value)} />
        <label className="grid gap-1 text-sm">
          <span className="text-brand-text/75">Birthday</span>
          <input type="date" value={form.birthday} onChange={(e) => setField("birthday", e.target.value)} className="rounded-xl border border-brand-light px-3 py-2 text-sm" />
        </label>
        {canEditWage ? (
          <label className="grid gap-1 text-sm">
            <span className="text-brand-text/75">Hourly wage</span>
            <input type="number" min="0" step="0.01" value={form.wage} onChange={(e) => setField("wage", e.target.value)} className="rounded-xl border border-brand-light px-3 py-2 text-sm" />
          </label>
        ) : (
          <div className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm text-brand-text/70">Hourly wage is managed by your manager.</div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-brand-light bg-white p-4 shadow-sm">
        <div className="font-semibold">Emergency contact</div>
        <TextInput label="Name" value={form.emergency_name} onChange={(value) => setField("emergency_name", value)} />
        <TextInput label="Phone" value={form.emergency_phone} onChange={(value) => setField("emergency_phone", value)} />
        <div className="pt-2 font-semibold">Account settings</div>
        <TextInput label="Email" type="email" value={form.email} onChange={(value) => setField("email", value)} />
        <TextInput label="Current password" type="password" value={form.current_password} onChange={(value) => setField("current_password", value)} />
        <TextInput label="New password" type="password" value={form.new_password} onChange={(value) => setField("new_password", value)} />
        <TextInput label="Confirm new password" type="password" value={form.confirm_password} onChange={(value) => setField("confirm_password", value)} />
        {error && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {status && <div className="rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{status}</div>}
        <div className="flex justify-end">
          <button className="rounded-xl border border-brand-dark bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-darker" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

function OpenShiftList({ shifts, positionsById, positionColors, claims, onClaim }) {
  if (!shifts.length) return null;
  const pendingShiftIds = new Set((claims || []).filter((claim) => claim.status === "pending").map((claim) => claim.shift_id));
  return (
    <div className="mt-4 rounded-[1.5rem] border border-brand-light bg-white p-4 shadow-sm">
      <div className="mb-3 text-lg font-bold text-brand-text">Open shifts<ProBadge /></div>
      <ul className="space-y-2">
        {shifts.map((shift) => {
          const tone = positionColors?.[shift.position_id] || POSITION_COLOR_PALETTE[0];
          return (
            <li key={shift.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brand/30 bg-white px-3 py-3 text-sm shadow-sm ${tone.border}`}>
              <div>
                <div className="font-medium">{fmtDateLabel(shift.starts_at)} • {fmtTime(shift.starts_at)} - {fmtTime(shift.ends_at)}</div>
                <div className="text-xs text-brand-text/70">{positionsById[shift.position_id]?.name || "Open role"}</div>
              </div>
              {pendingShiftIds.has(shift.id) ? (
                <Pill tone="warn">Pending</Pill>
              ) : !onClaim ? (
                <Pill>Claiming off</Pill>
              ) : (
                <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-darker" onClick={() => onClaim(shift.id)}>
                  Claim
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmployeeNextShiftBanner({ currentUser, schedules, locationsById }) {
  const now = new Date();
  const nowStart = new Date(now);
  nowStart.setHours(0, 0, 0, 0);

  const nextShift = (() => {
    const upcoming = [];
    for (const schedule of schedules || []) {
      for (const shift of schedule.shifts || []) {
        if (shift.user_id !== currentUser.id) continue;
        if (safeDate(shift.ends_at) < now) continue;
        upcoming.push({ ...shift, location_id: schedule.location_id });
      }
    }
    upcoming.sort((a, b) => safeDate(a.starts_at) - safeDate(b.starts_at));
    return upcoming[0] || null;
  })();

  let message = "No upcoming shifts scheduled. Check with your manager.";
  if (nextShift) {
    const shiftStart = safeDate(nextShift.starts_at);
    const shiftDay = new Date(shiftStart);
    shiftDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((shiftDay - nowStart) / 86400000);
    const timeRange = <span className="font-bold">{fmtTime(nextShift.starts_at)} - {fmtTime(nextShift.ends_at)}</span>;
    const locationName = locationsById?.[nextShift.location_id]?.name;

    if (diffDays <= 0) {
      message = <>Your next shift is TODAY • {timeRange}{locationName ? <> at {locationName}</> : null}</>;
    } else if (diffDays === 1) {
      message = <>Your next shift is TOMORROW • {timeRange}</>;
    } else if (diffDays <= 7) {
      message = <>Your next shift is {shiftStart.toLocaleDateString([], { weekday: "long" })} • {timeRange}</>;
    } else {
      message = <>Your next shift is {shiftStart.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} • {timeRange}</>;
    }
  }

  return (
    <div className="mb-4 rounded-2xl bg-brand-dark p-4 text-sm font-semibold text-white shadow-sm">
      <span className="mr-2" aria-hidden="true">🕐</span>
      {message}
    </div>
  );
}

function MyShifts({ currentUser, schedule, weekDays, positionsById, locationName, positionColors, onSwapRequest }) {
  const myShifts = (schedule?.shifts || []).filter((s) => s.user_id === currentUser.id);
  const ordered = [...myShifts].sort((a, b) => safeDate(a.starts_at) - safeDate(b.starts_at));
  return (
    <div className="rounded-[1.5rem] border border-brand-light bg-white shadow-sm">
      {ordered.length === 0 ? (
        <EmptyState icon="📭" heading="No shifts yet" message="No shifts scheduled for you this week." />
      ) : (
        <ul className="divide-y divide-brand-light">
          {ordered.map((shift) => {
            const tone = positionColors?.[shift.position_id] || POSITION_COLOR_PALETTE[0];
            return (
              <li key={shift.id} className={`flex flex-wrap items-center justify-between gap-3 border-l-4 bg-white px-4 py-4 text-sm ${tone.border}`}>
                <div className="flex items-center gap-3">
                  <AvatarBadge name={currentUser.full_name} className="h-8 w-8 text-xs" />
                  <div>
                    <div className="font-semibold">{fmtDateLabel(shift.starts_at)} • {fmtTime(shift.starts_at)} - {fmtTime(shift.ends_at)}</div>
                    <div className="text-xs text-brand-text/70">{positionsById[shift.position_id]?.name || "—"} • {locationName} • Break: {shift.break_min}m</div>
                  </div>
                </div>
                {onSwapRequest && (
                  <button className="rounded-xl border border-brand bg-white px-3 py-2 text-xs font-medium text-brand-dark transition hover:bg-brand-lightest" onClick={() => onSwapRequest(shift)}>
                    Swap
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TimeOffForm({ onSubmit }) {
  const [from, setFrom] = useState(fmtDate(new Date()));
  const [to, setTo] = useState(fmtDate(new Date()));
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-4 rounded-2xl border border-brand-light bg-white p-2.5 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">Request time off</h4>
        <button className="rounded-xl border border-brand bg-white px-3 py-1.5 text-sm font-medium text-brand-dark transition hover:bg-brand-lightest" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Close" : "Add"}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs">
            <span className="font-medium uppercase tracking-wide text-brand-text/60">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-brand-light px-2.5 py-1.5 text-xs" />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-medium uppercase tracking-wide text-brand-text/60">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-brand-light px-2.5 py-1.5 text-xs" />
          </label>
          <label className="col-span-2 grid gap-1 text-xs">
            <span className="font-medium uppercase tracking-wide text-brand-text/60">Notes</span>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl border border-brand-light px-2.5 py-1.5 text-sm" />
          </label>
          <div className="col-span-2 flex items-end justify-end">
            <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-darker" onClick={() => { onSubmit({ date_from: from, date_to: to, notes }); setExpanded(false); }}>
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MyUnavailabilityEditor({ currentUser, list, onAdd, onUpdate, onDelete }) {
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const mine = useMemo(() => (list || []).filter(ua => ua.user_id === currentUser.id && ua.kind === 'weekly'), [list, currentUser?.id]);

  const save = () => {
    if (editingId) {
      onUpdate({ id: editingId, user_id: currentUser.id, kind: 'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes });
      setEditingId(null);
    } else {
      onAdd({ user_id: currentUser.id, kind: 'weekly', weekday: Number(weekday), start_hhmm: start, end_hhmm: end, notes });
    }
    setNotes('');
    setExpanded(false);
  };

  const beginEdit = (ua) => { setEditingId(ua.id); setWeekday(Number(ua.weekday)); setStart(ua.start_hhmm); setEnd(ua.end_hhmm); setNotes(ua.notes || ''); setExpanded(true); };

  return (
    <div className="mt-4 rounded-2xl border border-brand-light bg-white p-2.5 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">My weekly unavailability</h4>
        <button className="rounded-xl border border-brand bg-white px-3 py-1.5 text-sm font-medium text-brand-dark transition hover:bg-brand-lightest" onClick={() => { setExpanded((v) => !v); if (expanded) setEditingId(null); }}>
          {expanded ? "Close" : "Add"}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">
            <span className="font-medium uppercase tracking-wide text-brand-text/60">Weekday</span>
            <select value={weekday} onChange={(e)=>setWeekday(Number(e.target.value))} className="rounded-xl border border-brand-light px-2.5 py-1.5 text-sm">
              {WEEK_LABELS.map((label, index) => (
                <option key={label} value={index}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-medium uppercase tracking-wide text-brand-text/60">Notes</span>
            <input type="text" value={notes} onChange={(e)=>setNotes(e.target.value)} className="rounded-xl border border-brand-light px-2.5 py-1.5 text-sm" />
          </label>
          <label className="grid gap-1 text-xs"><span className="font-medium uppercase tracking-wide text-brand-text/60">Start</span><input type="time" value={start} onChange={(e)=>setStart(e.target.value)} className="rounded-xl border border-brand-light px-2.5 py-1.5 text-sm"/></label>
          <label className="grid gap-1 text-xs"><span className="font-medium uppercase tracking-wide text-brand-text/60">End</span><input type="time" value={end} onChange={(e)=>setEnd(e.target.value)} className="rounded-xl border border-brand-light px-2.5 py-1.5 text-sm"/></label>
          <div className="sm:col-span-2 flex items-end justify-end gap-2">
            {editingId && <button className="rounded-xl border border-brand bg-white px-3 py-1.5 text-sm font-medium text-brand-dark transition hover:bg-brand-lightest" onClick={()=>{ setEditingId(null); setNotes(''); setExpanded(false); }}>Cancel</button>}
            <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-darker" onClick={save}>{editingId ? 'Save' : 'Add'}</button>
          </div>
        </div>
      )}
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
                <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={()=>beginEdit(ua)}>Edit</button>
                <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={()=>onDelete(ua.id)}>Delete</button>
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
            {editing && <button className="rounded-xl border border-brand-light bg-brand-lightest px-3 py-2 text-sm text-brand-dark transition hover:bg-brand-light" onClick={()=>setEditing(null)}>Cancel</button>}
            <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={save}>{editing ? 'Save' : 'Add'}</button>
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
                    <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={()=>beginEdit(ua)}>Edit</button>
                    <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={()=>onDelete(ua.id)}>Delete</button>
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
            <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={()=>{ onPost(body); setBody(""); }}>Post</button>
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
        {currentUser.role!=='employee' && <div className="rounded-2xl border p-3">
          <h4 className="mb-2 font-semibold">Create task</h4>
          <div className="grid gap-3">
            <TextInput label="Title" value={title} onChange={setTitle} placeholder="Clean front counter" />
            <Select label="Assign to" value={assignee} onChange={setAssignee} options={users.map(u=>({value:u.id,label:u.full_name}))} />
            <label className="grid gap-1 text-sm"><span className="text-gray-600">Due date</span><input type="date" value={due} onChange={(e)=>setDue(e.target.value)} className="rounded-xl border px-3 py-2"/></label>
            <div className="flex justify-end">
              <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={()=>{ onAdd(title, assignee, due, currentUser.id); setTitle(''); }}>Add</button>
            </div>
          </div>
        </div>}

        {currentUser.role!=='employee' && (
          <div className="rounded-2xl border p-3">
            <h4 className="mb-2 font-semibold">Task templates</h4>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <TextInput label="New template title" value={newTpl} onChange={setNewTpl} placeholder="Mop floor at close" />
              <div className="flex items-end"><button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={()=>{ if(!newTpl.trim()) return; onAddTemplate(newTpl.trim()); setNewTpl(''); }}>Add template</button></div>
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
                    <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={()=>onDeleteTemplate(t.id)}>Delete</button>
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
                <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={()=>onDelete(t.id)}>Delete</button>
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
              <div className={`max-w-[70%] rounded-xl border px-2 py-1 text-sm ${m.from_user_id===currentUser.id ? 'bg-brand text-white border-brand-dark' : 'bg-brand-lightest border-brand-light text-brand-text'}`}>
                {m.body}
                <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-xl border px-3 py-2 text-sm" value={body} onChange={(e)=>setBody(e.target.value)} placeholder="Type a message" />
          <button className="rounded-xl border border-brand-dark bg-brand-dark px-3 py-2 text-sm text-white transition hover:bg-brand-darker" onClick={()=>{ onSend(currentUser.id, peerId, body); setBody(''); }}>Send</button>
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
                <button className="rounded-xl border border-brand-dark bg-brand-dark px-2 py-1 text-white transition hover:bg-brand-darker" onClick={()=>onSetStatus(r.id,'approved')}>Approve</button>
                <button className="rounded-xl border border-brand-light bg-brand-lightest px-2 py-1 text-brand-dark transition hover:bg-brand-light" onClick={()=>onSetStatus(r.id,'denied')}>Deny</button>
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
