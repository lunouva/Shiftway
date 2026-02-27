# Shiftway Server

Node/Express backend for Shiftway (Live mode).

## Quick start

```bash
cd server
npm ci
cp .env.example .env

# Start Postgres
# Check prerequisites (Docker vs local Postgres)
npm run db:check

# Option A (recommended): Docker
npm run db:up

# Option B: local Postgres
# - install Postgres and ensure it's listening on 127.0.0.1:5432 (or update DATABASE_URL)
# - then run db:init

# Initialize schema + seed
npm run db:init
# If Postgres is down, db:init will try to start Docker Compose automatically when available.

npm run dev
```

By default the server listens on `http://localhost:4000`.

## Environment variables

See `.env.example` for the full list.

Minimum required for local dev:
- `DATABASE_URL`
- `PORT` (optional; defaults to 4000)
- `APP_URL` (used for links/callbacks)

## Notes

- The frontend points at the Live API via `VITE_API_BASE` (Live is the default).
- Internal demo mode (no backend) is gated by the frontend build flag `VITE_ENABLE_DEMO=1` and activated with `?demo=1`.
