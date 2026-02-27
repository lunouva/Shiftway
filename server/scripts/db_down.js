#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function runCompose(args) {
  let res = spawnSync('docker', ['compose', ...args], { stdio: 'inherit' });
  if ((res.status ?? 1) !== 0 && !res.error) {
    res = spawnSync('docker-compose', args, { stdio: 'inherit' });
  }
  return res;
}

const res = runCompose(['-f', 'docker-compose.yml', 'down']);

if (res.error) {
  if (res.error.code === 'ENOENT') {
    console.error('Docker/Compose is not installed or not on PATH.');
    console.error('If you are running Postgres locally (not via Docker), you can ignore db:down.');
    process.exit(1);
  }
  console.error('Failed to stop docker compose:', res.error.message || res.error);
  process.exit(1);
}

process.exit(res.status ?? 0);
