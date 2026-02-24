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
const psql = has("psql");

console.log("Shiftway DB prerequisites check");
console.log(`- docker: ${docker ? "yes" : "no"}`);
console.log(`- psql:   ${psql ? "yes" : "no"}`);
console.log("");

if (docker) {
  console.log("Recommended: run Postgres via Docker:");
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

console.error("Neither Docker nor psql were found.");
console.error("To run the Live backend locally you need a reachable Postgres instance.");
console.error("Options:");
console.error("  1) Install Docker, then run: npm run db:up");
console.error("  2) Install Postgres locally and set DATABASE_URL in server/.env");
console.error("  3) Point DATABASE_URL at a reachable Postgres instance");
process.exit(1);
