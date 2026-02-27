#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function runCompose(args) {
  const attempts = [
    { cmd: 'docker', args: ['compose', ...args], label: 'docker compose' },
    { cmd: 'docker-compose', args, label: 'docker-compose' },
    { cmd: 'podman', args: ['compose', ...args], label: 'podman compose' },
    { cmd: 'podman-compose', args, label: 'podman-compose' },
  ];

  let last = null;
  for (const attempt of attempts) {
    const res = spawnSync(attempt.cmd, attempt.args, { stdio: 'inherit' });
    if (res.error?.code === 'ENOENT') continue;
    last = { ...res, label: attempt.label };
    if ((res.status ?? 1) === 0) return last;
  }

  return last || { error: { code: 'ENOENT' } };
}

const res = runCompose(['-f', 'docker-compose.yml', 'down']);

if (res.error) {
  if (res.error.code === 'ENOENT') {
    console.error('No supported Compose runtime found on PATH.');
    console.error('Install one of: docker compose, docker-compose, podman compose, or podman-compose.');
    console.error('If you are running Postgres locally (not via containers), you can ignore db:down.');
    process.exit(1);
  }
  console.error('Failed to stop compose stack:', res.error.message || res.error);
  process.exit(1);
}

process.exit(res.status ?? 0);
