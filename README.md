# Shiftway

Scheduling app with a real backend (Node/Express + Postgres). Live mode is the default.

License: MIT (see `LICENSE`).

## Frontend

```bash
cd /home/kyle/projects/apps/Shiftway
# Node 20+ recommended (see .nvmrc)

# One-command local setup (creates .env files if missing)
./scripts/dev-setup.sh

# Or: install frontend + server deps in one go
npm run install:all

cp .env.example .env
npm run dev
```

(If you only want the frontend, `npm ci` is enough.)

- The frontend uses `VITE_API_BASE`.
  - Local dev default: `http://localhost:4000`
  - Deployed default: same-origin (recommended to set `VITE_API_BASE` explicitly)

## Backend

Run Postgres locally:
```bash
cd /home/kyle/projects/apps/Shiftway/server
npm run db:check
npm run db:up
```

Then:
```bash
cd /home/kyle/projects/apps/Shiftway/server
npm ci
cp .env.example .env
npm run db:init
npm run dev
```

Smoke-check the backend once it is running:
```bash
curl -sSf http://localhost:4000/api/health
```

Server env vars are documented in `server/.env.example`.

If `npm run db:init` fails with `ECONNREFUSED 127.0.0.1:5432`:
- Run `npm run db:check` to see what prerequisites are missing.
- If Docker is installed, start Postgres with `npm run db:up` and retry `npm run db:init`.
- If Docker is unavailable, point `DATABASE_URL` in `server/.env` at any reachable Postgres instance and retry.

## Release checklist

See `docs/release-checklist.md`.

## CI (GitHub Actions)

There’s a ready-to-copy workflow at `docs/github-actions-ci.yml`.

Local CI-like check (frontend build + server syntax checks):
```bash
npm run ci
# (alias: npm run check)
```

To enable GitHub Actions CI:
1) Create `.github/workflows/ci.yml` in the repo
2) Copy/paste the contents of `docs/github-actions-ci.yml`

If you see an error like:
> refusing to allow an OAuth App to create or update workflow ... without `workflow` scope

…then create the workflow file via the GitHub web UI (or use a PAT that includes the `workflow` scope).

## Internal demo (optional)

Demo mode is available only for internal demos:
- build-time flag: `VITE_ENABLE_DEMO=1`
- URL flag: `?demo=1`
- non-local hosts must also be allowlisted via `VITE_DEMO_ALLOWED_HOSTS`

Example:
- `VITE_ENABLE_DEMO=1`
- `VITE_DEMO_ALLOWED_HOSTS=demo.shiftway.app`
- open: `https://demo.shiftway.app/?demo=1`

This is intentionally hidden from normal production usage.

## Marketing site

Static landing page in `marketing/`. Open `marketing/index.html` in a browser.
