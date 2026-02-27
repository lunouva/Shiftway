#!/usr/bin/env node
import { execSync } from "node:child_process";
import net from "node:net";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function has(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function parseDbTarget(connectionString) {
  if (!connectionString) return null;
  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    const port = Number(url.port || 5432);
    if (!host || !Number.isFinite(port) || port <= 0) return null;
    return { host, port };
  } catch {
    return null;
  }
}

function checkTcp({ host, port }, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (ok, reason = "") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, reason });
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false, "timeout"));
    socket.on("error", (err) => finish(false, err?.code || err?.message || "error"));
  });
}

const docker = has("docker");
const dockerCompose = has("docker-compose");
const podman = has("podman");
const podmanCompose = has("podman-compose");
const psql = has("psql");
const hasCompose = docker || dockerCompose || podman || podmanCompose;
const databaseUrl = process.env.DATABASE_URL || "";
const dbTarget = parseDbTarget(databaseUrl);

console.log("Shiftway DB prerequisites check");
console.log(`- docker: ${docker ? "yes" : "no"}`);
console.log(`- docker-compose: ${dockerCompose ? "yes" : "no"}`);
console.log(`- podman: ${podman ? "yes" : "no"}`);
console.log(`- podman-compose: ${podmanCompose ? "yes" : "no"}`);
console.log(`- psql:   ${psql ? "yes" : "no"}`);
console.log(`- DATABASE_URL in env: ${databaseUrl ? "yes" : "no"}`);

let reach = null;
if (dbTarget) {
  reach = await checkTcp(dbTarget);
  console.log(`- DATABASE_URL host reachable (${dbTarget.host}:${dbTarget.port}): ${reach.ok ? "yes" : `no (${reach.reason})`}`);
} else if (databaseUrl) {
  console.log("- DATABASE_URL parseable: no");
}

console.log("");

if (hasCompose) {
  console.log("Recommended: run Postgres via a Compose runtime (Docker/Podman):");
  console.log("  npm run db:up");
  console.log("  npm run db:init");
  process.exit(0);
}

if (psql) {
  console.log("You appear to have Postgres client tools installed.");
  console.log("Ensure Postgres is running and DATABASE_URL in server/.env points to it, then:");
  console.log("  npm run db:init");
  process.exit(0);
}

if (reach?.ok) {
  console.log("No local Compose runtime/psql detected, but DATABASE_URL is reachable.");
  console.log("You can proceed with:");
  console.log("  npm run db:init");
  process.exit(0);
}

console.error("Neither a Compose runtime (Docker/Podman) nor psql were found.");
console.error("To run the Live backend locally you need a reachable Postgres instance.");
if (!databaseUrl) {
  console.error("Also: DATABASE_URL is not set in the environment.");
  console.error("Create server/.env from server/.env.example and set DATABASE_URL.");
}
console.error("Options:");
console.error("  1) Install docker compose / docker-compose / podman compose / podman-compose, then run: npm run db:up");
console.error("  2) Install Postgres locally and set DATABASE_URL in server/.env");
console.error("  3) Point DATABASE_URL at a reachable Postgres instance");
process.exit(1);
