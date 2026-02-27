# Deploy (Shiftway)

## Overview
- **Frontend**: static Vite build (Netlify-friendly)
- **Backend**: Node/Express server + Postgres

## Frontend
1) Set env var:
   - `VITE_API_BASE=https://<your-backend-host>`
2) Build:
   ```bash
   npm ci
   npm run build
   ```
3) Deploy `dist/` to your static host.

## Backend
1) Provision Postgres and set:
   - `DATABASE_URL=postgres://...`
2) Set required server env vars:
   - `NODE_ENV=production`
   - `PORT=4000` (or platform-provided)
   - `APP_URL=https://<your-primary-frontend-host>`
   - `APP_ALLOWED_ORIGINS=https://<optional-preview-host>,https://<optional-admin-host>`
   - `JWT_SECRET=...`
   - `SESSION_SECRET=...`
   - `DATABASE_URL=postgres://...`
   - Optional hardening: `TRUST_PROXY=1` when behind multiple reverse proxies
   - Production preflight enforces secure URL config: `APP_URL` should be `https://...`, and `APP_ALLOWED_ORIGINS` entries should also be `https://...` (localhost is the only exception).
3) Install + preflight + init DB:
   ```bash
   cd server
   npm ci
   npm run preflight
   npm run db:check
   npm run db:init
   npm start
   ```
   If `npm run db:init` fails with `ECONNREFUSED`, Postgres is not reachable from the app host yet. Re-check `DATABASE_URL`, network rules, and DB availability before retrying.

## Local dev (recommended)
Bring up Postgres:
```bash
cd server
npm run db:check
npm run db:up
```
Then run DB init + server:
```bash
cd server
cp .env.example .env
npm ci
npm run db:init
npm run dev
```

## Troubleshooting
- Frontend shows “Backend unreachable”: confirm server is running and `VITE_API_BASE` points to it.
- Browser requests fail with 403 `forbidden`: add the frontend origin to `APP_ALLOWED_ORIGINS` (or set `APP_URL` to the correct host).
  - Origins are normalized server-side (`https://app.example.com` and `https://app.example.com/` are treated the same).
- If the backend is up but DB isn’t:
  - `/api/health` returns `db_not_configured` → set `DATABASE_URL` in `server/.env`
  - `/api/health` returns `db_unreachable` → Postgres isn’t reachable at `DATABASE_URL`

## Production hardening flags
Set these on your frontend build:
- `VITE_ENABLE_DEMO=0` (or unset): keeps demo mode disabled by default
- `VITE_DEMO_ALLOWED_HOSTS` unset (or empty): blocks demo activation on non-local hosts
- `VITE_SHOW_BACKEND_SETTINGS=0` (or unset): keeps backend-mode controls out of the UI
- `VITE_SHOW_DEMO_CONTROLS=0` (or unset): hides demo-only controls/credential hints even when demo is enabled

For an internal demo deployment, set all three intentionally:
- `VITE_ENABLE_DEMO=1`
- `VITE_DEMO_ALLOWED_HOSTS=demo.shiftway.app`
- open the app with `?demo=1`

## Post-deploy verification
1) Open the frontend and verify login does **not** show demo credentials.
2) Check API health:
   ```bash
   curl -sSf https://<your-backend-host>/api/health
   ```
3) Confirm the frontend is pointed to the backend host (`VITE_API_BASE`).


### Backend startup smoke test
After deploying, run this once from your terminal:
```bash
curl -sS https://<your-backend-host>/api/health
```
Expected response includes:
- `ok: true`
- `db: true`

If `db` is false, re-check `DATABASE_URL` and network access from app host to Postgres.


## Backend preflight
Before cutting production, run:
```bash
cd server
npm run preflight
```
This validates required env vars and confirms Postgres connectivity.
