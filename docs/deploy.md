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
   - `APP_URL=https://<your-frontend-host>`
   - `JWT_SECRET=...`
   - `SESSION_SECRET=...`
3) Install + init DB:
   ```bash
   cd server
   npm ci
   npm run db:init
   npm start
   ```

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
- If the backend is up but DB isn’t:
  - `/api/health` returns `db_not_configured` → set `DATABASE_URL` in `server/.env`
  - `/api/health` returns `db_unreachable` → Postgres isn’t reachable at `DATABASE_URL`

## Production hardening flags
Set these on your frontend build:
- `VITE_ENABLE_DEMO=0` (or unset): keeps demo mode disabled by default
- `VITE_DEMO_ALLOWED_HOSTS` unset (or empty): blocks demo activation on non-local hosts
- `VITE_SHOW_BACKEND_SETTINGS=0` (or unset): keeps backend-mode controls out of the UI

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
