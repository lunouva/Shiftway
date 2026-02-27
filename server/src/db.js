import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

const toInt = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const poolConfig = {
  connectionString: DATABASE_URL,
  max: toInt(process.env.DB_POOL_MAX, 10),
  idleTimeoutMillis: toInt(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
  connectionTimeoutMillis: toInt(process.env.DB_CONNECT_TIMEOUT_MS, 10_000),
  keepAlive: true,
};

if (String(process.env.DB_SSL || "").toLowerCase() === "require") {
  poolConfig.ssl = { rejectUnauthorized: false };
}

// Allow the server to boot even if DATABASE_URL is missing, so /api/health can
// report the problem and local dev onboarding is less brittle.
let pool = null;
if (DATABASE_URL) {
  pool = new pg.Pool(poolConfig);
} else {
  // eslint-disable-next-line no-console
  console.warn(
    "[db] Missing DATABASE_URL. Live backend mode will not work until you create server/.env from server/.env.example and set DATABASE_URL."
  );
}

export const query = async (text, params) => {
  if (!pool) {
    throw new Error(
      "Missing DATABASE_URL. Create server/.env from server/.env.example and set DATABASE_URL (Postgres connection string)."
    );
  }
  return pool.query(text, params);
};

export default pool;
