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

const readEnvValue = (key) => {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*\"([^\"]*)\"`, "m"));
  return match ? match[1] : null;
};

const errors = [];
for (const [key, expected] of Object.entries(required)) {
  const value = readEnvValue(key);
  if (value == null) {
    errors.push(`${key} is missing from netlify.toml [build.environment]`);
    continue;
  }
  if (value !== expected) {
    errors.push(`${key} must be \"${expected}\" in netlify.toml (found \"${value}\")`);
  }
}

// Live mode should be deploy-ready by default: production frontend must target a real API host.
const apiBase = readEnvValue("VITE_API_BASE");
if (apiBase == null || !apiBase.trim()) {
  errors.push("VITE_API_BASE must be set in netlify.toml [build.environment] for production builds");
} else if (/^https?:\/\/localhost(?::\d+)?$/i.test(apiBase.trim())) {
  errors.push(`VITE_API_BASE must not point to localhost in production (found \"${apiBase}\")`);
}

if (errors.length) {
  console.error("Deploy config validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("Deploy config validation passed (demo/internal controls disabled and Live API base configured).");
