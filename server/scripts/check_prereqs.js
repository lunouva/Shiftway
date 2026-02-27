#!/usr/bin/env node
import { execSync } from "node:child_process";

function has(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const docker = has("docker");
const dockerCompose = has("docker-compose");
const psql = has("psql");
const hasCompose = docker || dockerCompose;

console.log("Shiftway DB prerequisites check");
console.log(`- docker: ${docker ? "yes" : "no"}`);
console.log(`- docker-compose: ${dockerCompose ? "yes" : "no"}`);
console.log(`- psql:   ${psql ? "yes" : "no"}`);
console.log(`- DATABASE_URL in env: ${process.env.DATABASE_URL ? "yes" : "no"}`);
console.log("");

if (hasCompose) {
  console.log("Recommended: run Postgres via Docker Compose:");
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

console.error("Neither Docker Compose nor psql were found.");
console.error("To run the Live backend locally you need a reachable Postgres instance.");
if (!process.env.DATABASE_URL) {
  console.error("Also: DATABASE_URL is not set in the environment.");
  console.error("Create server/.env from server/.env.example and set DATABASE_URL.");
}
console.error("Options:");
console.error("  1) Install Docker (or docker-compose), then run: npm run db:up");
console.error("  2) Install Postgres locally and set DATABASE_URL in server/.env");
console.error("  3) Point DATABASE_URL at a reachable Postgres instance");
process.exit(1);
