import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import pg from "pg";
import dotenv from "dotenv";
import net from "node:net";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const sqlPath = path.resolve(process.cwd(), "scripts", "init_db.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Create server/.env from server/.env.example and set DATABASE_URL first.");
  console.error("Example: DATABASE_URL=postgres://postgres:postgres@localhost:5432/shiftway");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
let prereqChecked = false;

const RETRY_ATTEMPTS = Number(process.env.DB_INIT_RETRIES || 12);
const RETRY_DELAY_MS = Number(process.env.DB_INIT_RETRY_DELAY_MS || 1000);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryConnectAndInit() {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log("Database initialized.");
  } finally {
    await client.end().catch(() => null);
  }
}

async function retryConnectAndInit({ attempts = RETRY_ATTEMPTS, delayMs = RETRY_DELAY_MS, onRetry } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await tryConnectAndInit();
      return true;
    } catch (err) {
      lastErr = err;
      const isConnRefused = err && typeof err === "object" && err.code === "ECONNREFUSED";
      if (!isConnRefused || i === attempts - 1) throw err;
      if (typeof onRetry === "function") onRetry(i + 1, attempts, delayMs);
      await sleep(delayMs);
    }
  }
  if (lastErr) throw lastErr;
  return false;
}

function hasCommand(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getDbEndpoint() {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname || "127.0.0.1";
    const port = Number(parsed.port || 5432);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { host, port };
  } catch {
    return null;
  }
}

async function isTcpReachable(host, port, timeoutMs = 500) {
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function maybeFastFailMissingDb() {
  const endpoint = getDbEndpoint();
  if (!endpoint) return false;

  const reachable = await isTcpReachable(endpoint.host, endpoint.port, 500);
  if (reachable) return false;

  const hasDocker = hasCommand("docker") || hasCommand("docker-compose");
  const hasPsql = hasCommand("psql");

  if (hasDocker || hasPsql) return false;

  console.error(`Cannot reach Postgres at ${endpoint.host}:${endpoint.port}.`);
  console.error("No Docker/Compose or psql detected, so db:init cannot auto-recover on this machine.");
  runPrereqCheck();
  return true;
}

function runPrereqCheck() {
  if (prereqChecked) return;
  prereqChecked = true;
  try {
    console.error("\nRunning prerequisite check (npm run db:check):\n");
    execSync("npm run db:check", { stdio: "inherit" });
  } catch {
    // db:check already prints actionable guidance + exits non-zero when needed.
  }
}

function getComposeRunner() {
  try {
    execSync("command -v docker", { stdio: "ignore" });
    return ["docker", ["compose", "-f", "docker-compose.yml", "up", "-d"]];
  } catch {}
  try {
    execSync("command -v docker-compose", { stdio: "ignore" });
    return ["docker-compose", ["-f", "docker-compose.yml", "up", "-d"]];
  } catch {}
  return null;
}

try {
  const fastFailed = await maybeFastFailMissingDb();
  if (fastFailed) {
    process.exitCode = 1;
  } else {
    await retryConnectAndInit({
      onRetry: (attempt, attempts, delayMs) => {
        console.error(`Postgres not ready yet (attempt ${attempt}/${attempts}); retrying in ${delayMs}ms...`);
      },
    });
  }
} catch (err) {
  let recovered = false;

  // Common local dev failure: DB isn't running yet.
  if (err && typeof err === "object" && err.code === "ECONNREFUSED") {
    console.error("Could not connect to Postgres (connection refused). Is your DB running?");

    const composeRunner = getComposeRunner();
    if (composeRunner) {
      // Best-effort: if Docker Compose is available, bring up the DB automatically and retry.
      try {
        console.error("Attempting to start Postgres via Docker Compose...");
        const [composeCmd, composeArgs] = composeRunner;
        execSync([composeCmd, ...composeArgs].join(" "), { stdio: "inherit" });
        // Give Postgres a moment to accept connections.
        try {
          await retryConnectAndInit({
            attempts: Math.max(RETRY_ATTEMPTS, 20),
            delayMs: RETRY_DELAY_MS,
            onRetry: (attempt, attempts) => {
              console.error(`Waiting for Postgres after compose start (attempt ${attempt}/${attempts})...`);
            },
          });
          recovered = true;
        } catch (e2) {
          if (!(e2 && typeof e2 === "object" && e2.code === "ECONNREFUSED")) throw e2;
        }
        if (!recovered) {
          console.error("Postgres started but is still not accepting connections (timeout). Try again in a few seconds.");
          console.error("If needed: npm run db:up && npm run db:init");
        }
      } catch (e) {
        console.error("Docker is installed but starting Postgres failed.");
        console.error("Try: npm run db:up");
        console.error(e);
      }
    } else {
      console.error("No local Postgres detected.");
      console.error("Options:");
      console.error("  0) Run: npm run db:check  (prints which prerequisites are available)");
      console.error("  1) Install Docker, then run: npm run db:up");
      console.error("  2) Install Postgres locally and ensure it matches your DATABASE_URL");
      console.error("  3) Point DATABASE_URL at a reachable Postgres instance");
      console.error("Then re-run: npm run db:init");
      runPrereqCheck();
    }
  }

  if (!recovered) {
    console.error(err);
    // Final nudge with concrete environment diagnostics.
    runPrereqCheck();
    process.exitCode = 1;
  }
}
