#!/usr/bin/env node
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const mode = process.env.NODE_ENV || "development";
const isProd = mode === "production";

const requiredAlways = ["DATABASE_URL"];
const requiredInProd = ["APP_URL", "JWT_SECRET", "SESSION_SECRET"];

const missing = [];
for (const key of requiredAlways) {
  if (!process.env[key]) missing.push(key);
}

if (isProd) {
  for (const key of requiredInProd) {
    if (!process.env[key]) missing.push(key);
  }
  if (process.env.JWT_SECRET === "dev-secret") missing.push("JWT_SECRET (must not be dev-secret in production)");
  if (process.env.SESSION_SECRET === "dev-session") missing.push("SESSION_SECRET (must not be dev-session in production)");
}

if (missing.length) {
  console.error("[preflight] Missing/invalid required env vars:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

const parseOrigins = () => {
  const raw = String(process.env.APP_ALLOWED_ORIGINS || "");
  if (!raw.trim()) return [];
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
};

const verifyUrlLike = (value, label) => {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) {
      console.error(`[preflight] ${label} must use http:// or https://. Got: ${value}`);
      return null;
    }
    return parsed;
  } catch {
    console.error(`[preflight] ${label} must be a valid URL. Got: ${value}`);
    return null;
  }
};

const isOriginOnlyUrl = (parsed) => parsed.pathname === "/" && !parsed.search && !parsed.hash;

const isLocalHost = (hostname) => {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
};

let urlErrors = 0;
const appUrl = process.env.APP_URL ? verifyUrlLike(process.env.APP_URL, "APP_URL") : null;
if (process.env.APP_URL && !appUrl) urlErrors += 1;

if (appUrl && !isOriginOnlyUrl(appUrl)) {
  console.error(`[preflight] APP_URL must be an origin only (no path/query/hash). Got: ${process.env.APP_URL}`);
  urlErrors += 1;
}

if (isProd && appUrl && appUrl.protocol !== "https:") {
  console.error(`[preflight] APP_URL should use https:// in production. Got: ${process.env.APP_URL}`);
  urlErrors += 1;
}

const seenOrigins = new Set();
for (const origin of parseOrigins()) {
  const parsed = verifyUrlLike(origin, "APP_ALLOWED_ORIGINS entry");
  if (!parsed) {
    urlErrors += 1;
    continue;
  }
  if (!isOriginOnlyUrl(parsed)) {
    console.error(`[preflight] APP_ALLOWED_ORIGINS entries must be origins only (no path/query/hash). Got: ${origin}`);
    urlErrors += 1;
  }
  const normalizedOrigin = parsed.origin.toLowerCase();
  if (seenOrigins.has(normalizedOrigin)) {
    console.error(`[preflight] APP_ALLOWED_ORIGINS contains duplicate origin: ${parsed.origin}`);
    urlErrors += 1;
  } else {
    seenOrigins.add(normalizedOrigin);
  }
  if (isProd && parsed.protocol !== "https:" && !isLocalHost(parsed.hostname)) {
    console.error(`[preflight] APP_ALLOWED_ORIGINS should use https:// in production (except localhost). Got: ${origin}`);
    urlErrors += 1;
  }
}
if (urlErrors > 0) process.exit(1);

const connectTimeoutMs = Number(process.env.PREFLIGHT_DB_TIMEOUT_MS || 5000);

const run = async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: connectTimeoutMs });
  try {
    await pool.query("SELECT 1 as ok");
    console.log(`[preflight] OK (${mode})`);
    console.log("- env vars look valid");
    console.log("- database is reachable");
  } catch (err) {
    console.error("[preflight] Database connectivity check failed.");
    console.error(`- ${String(err?.message || err)}`);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => null);
  }
};

run();
