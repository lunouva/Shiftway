#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function runCompose(args) {
  // Prefer modern `docker compose`, but support legacy `docker-compose` too.
  let res = spawnSync('docker', ['compose', ...args], { stdio: 'inherit' });
  if ((res.status ?? 1) !== 0 && !res.error) {
    res = spawnSync('docker-compose', args, { stdio: 'inherit' });
  }
  return res;
}

const res = runCompose(['-f', 'docker-compose.yml', 'up', '-d']);

if (res.error) {
  if (res.error.code === 'ENOENT') {
    console.error('Docker/Compose is not installed or not on PATH.');
    console.error('To run Postgres via Docker: install Docker Desktop / Engine, then re-run: npm run db:up');
    console.error('Alternatively: install Postgres locally and set DATABASE_URL in server/.env before running: npm run db:init');
    process.exit(1);
  }
  console.error('Failed to start docker compose:', res.error.message || res.error);
  process.exit(1);
}

process.exit(res.status ?? 0);
