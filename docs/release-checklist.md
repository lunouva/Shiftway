# Shiftway — First Release Checklist

This repo is intentionally lightweight; this checklist is here to make a "v0.1" release repeatable.

## Prereqs
- Node **20+** (see `.nvmrc`)
- Postgres (for Live mode backend)
- Optional: Docker (only if you want to run Postgres via `npm run db:up`)

## Local quality gates (run before tagging)
```bash
# CI-like check (frontend build + server install)
npm run ci
# (alias: npm run check)
```

This check now includes a deploy guard that fails if `netlify.toml` enables demo/internal-only UI controls in production.

Optional (recommended) smoke checks:
- Frontend loads (production build) and basic navigation works.
- Live mode can:
  - start the server
  - initialize DB
  - log in / create a session (as applicable)

## Backend (Live mode) smoke
```bash
cd server
cp .env.example .env
npm ci
npm run db:check
npm run preflight
npm run db:init
npm run start
```

If `npm run db:init` fails with `ECONNREFUSED 127.0.0.1:5432`:
- start Postgres (`npm run db:up` if Docker is installed), or
- run a local Postgres service manually, or
- point `DATABASE_URL` at a reachable Postgres instance.
- if Postgres is starting slowly, increase init retries temporarily:
  `DB_INIT_RETRIES=30 DB_INIT_RETRY_DELAY_MS=1000 npm run db:init`

## Frontend env sanity
- `VITE_API_BASE` should point at the server (defaults to `http://localhost:4000`).

## Tagging / versioning
- Update `CHANGELOG.md` (move items from **Unreleased** into the release).
- Bump `package.json` version (root) when cutting releases.
- Create a git tag (e.g. `v0.1.0`) on `main`.

## CI
A copy/paste GitHub Actions workflow is available at `docs/github-actions-ci.yml`.

To enable CI in GitHub:
1) Create `.github/workflows/ci.yml` *via the GitHub web UI* (or use a PAT that includes the `workflow` scope)
2) Paste the contents of `docs/github-actions-ci.yml`
3) Verify the **CI** workflow runs on a PR
