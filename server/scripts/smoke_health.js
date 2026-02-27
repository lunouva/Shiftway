#!/usr/bin/env node
import process from "node:process";

const target = process.env.SHIFTWAY_HEALTH_URL || process.argv[2] || "http://localhost:4000/api/health";
const timeoutMs = Number(process.env.SHIFTWAY_HEALTH_TIMEOUT_MS || 8000);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const res = await fetch(target, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: controller.signal,
  });

  const contentType = String(res.headers.get("content-type") || "");
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = isJson ? JSON.stringify(payload) : String(payload || "");
    console.error(`[smoke:health] FAIL ${res.status} ${res.statusText} ${target}`);
    if (detail) console.error(detail);
    process.exit(1);
  }

  const ok = payload?.ok === true;
  const db = payload?.db === true;

  if (!ok || !db) {
    console.error(`[smoke:health] FAIL unhealthy response from ${target}`);
    console.error(JSON.stringify(payload));
    process.exit(1);
  }

  console.log(`[smoke:health] PASS ${target}`);
  console.log(JSON.stringify(payload));
} catch (err) {
  const timedOut = err?.name === "AbortError";
  console.error(`[smoke:health] FAIL ${target}`);
  console.error(timedOut ? `Request timed out after ${timeoutMs}ms` : String(err?.message || err));
  process.exit(1);
} finally {
  clearTimeout(timer);
}
