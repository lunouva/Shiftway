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
