#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "netlify.toml");
const text = fs.readFileSync(file, "utf8");

const required = {
  VITE_ENABLE_DEMO: "0",
  VITE_SHOW_BACKEND_SETTINGS: "0",
  VITE_SHOW_DEMO_CONTROLS: "0",
};

const errors = [];
for (const [key, expected] of Object.entries(required)) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*\"([^\"]*)\"`, "m"));
  if (!match) {
    errors.push(`${key} is missing from netlify.toml [build.environment]`);
    continue;
  }
  if (match[1] !== expected) {
    errors.push(`${key} must be \"${expected}\" in netlify.toml (found \"${match[1]}\")`);
  }
}

if (errors.length) {
  console.error("Deploy config validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("Deploy config validation passed (demo + internal controls disabled by default).");
