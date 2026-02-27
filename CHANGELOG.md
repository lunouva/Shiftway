# Changelog

All notable changes to Shiftway will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-02-27

### Added
- `docs/deploy.md`: frontend + backend deployment guide (Netlify + Render).
- `render.yaml`: one-click Render blueprint for backend hosting.
- `docs/release-checklist.md`: repeatable first-release checklist.
- `docs/github-actions-ci.yml`: copy-paste CI workflow for GitHub Actions.
- `npm run final:check`: single command to validate final-product prerequisites.
- `scripts/verify-deploy-config.js`: deploy guard enforcing demo flags off and `VITE_API_BASE` set in production.
- `scripts/preflight.js`: server-side preflight checks (DB connectivity, env sanity, CORS origin validation).
- `scripts/check_prereqs.js`: detects available Postgres tooling (Docker/Podman/system pg).
- Request-ID tracing for API errors (server and UI).
- DB init retries with configurable `DB_INIT_RETRIES` + `DB_INIT_RETRY_DELAY_MS`.
- DB SSL support via `DB_SSL` env var.
- Podman Compose support alongside Docker Compose for local DB workflows.
- Web Push, Twilio SMS, SMTP email, Google OAuth scaffolding in server.

### Changed
- **Live mode is now the default.** Demo mode requires explicit `VITE_ENABLE_DEMO=1`.
- Demo/Live toggle removed from normal UI. `VITE_SHOW_BACKEND_SETTINGS=0` and `VITE_SHOW_DEMO_CONTROLS=0` enforced in production build.
- `netlify.toml` enforces `VITE_API_BASE` pointing to a non-localhost host (verified by CI deploy guard).
- Hardened API error handling: request size limits, malformed JSON, 5xx + network errors with actionable messages.
- `db:init` fast-fails with a clear message when Postgres is unreachable and no local tooling is found.
- README updated to reflect production-first usage (no demo toggle in normal instructions).

## [0.0.1] - 2026-02-10

### Added
- Initial app scaffold (frontend + server) with demo mode and live backend mode.
- 2026-02-24: Ensure live default; hide demo toggle by flag (config) and gate demo UI; prepared docs for deployment
