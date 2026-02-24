import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const sqlPath = path.resolve(process.cwd(), "scripts", "init_db.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Create server/.env from server/.env.example and set DATABASE_URL first.");
  console.error("Example: DATABASE_URL=postgres://postgres:postgres@localhost:5432/shiftway");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString });

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasDocker() {
  try {
    execSync("command -v docker", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function tryConnectAndInit() {
  await client.connect();
  await client.query(sql);
  console.log("Database initialized.");
}

try {
  await tryConnectAndInit();
} catch (err) {
  // Common local dev failure: DB isn't running yet.
  if (err && typeof err === "object" && err.code === "ECONNREFUSED") {
    console.error("Could not connect to Postgres (connection refused). Is your DB running?");

    if (hasDocker()) {
      // Best-effort: if Docker is available, bring up the DB automatically and retry.
      try {
        console.error("Attempting to start Postgres via Docker Compose...");
        execSync("docker compose -f docker-compose.yml up -d", { stdio: "inherit" });
        // Give Postgres a moment to accept connections.
        let ok = false;
        for (let i = 0; i < 10; i++) {
          try {
            await sleep(1000);
            await tryConnectAndInit();
            ok = true;
            break;
          } catch (e2) {
            if (e2 && typeof e2 === "object" && e2.code === "ECONNREFUSED") continue;
            throw e2;
          }
        }
        if (ok) {
          process.exitCode = 0;
        } else {
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
    }
  }

  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
