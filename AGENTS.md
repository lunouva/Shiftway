# Shiftway — Agent Context

## Project
- **Frontend**: React + Vite + Tailwind (`src/App.jsx` — single file app)
- **Backend**: Express + PostgreSQL (`server/src/index.js`)
- **Frontend dev**: `http://localhost:5173`
- **Backend dev**: `http://localhost:4000`
- **Brand color**: `#82C8E5` (brand), `#3A8FAD` (brand-dark), `#1E6080` (brand-darker)

## ✅ Features Complete
- Weekly schedule grid, add/delete shifts, publish/unpublish
- Copy last week's schedule
- Open shifts + employee claiming
- Shift color coding by position
- Hours summary + labor cost tracking (wages, daily/weekly totals)
- Print/export (CSV + print view)
- Time off conflict detection
- Shift swap requests + time off requests + weekly unavailability
- Pending approvals tab (all requests in one place)
- Add employees with full profile fields
- Invite via email (Resend) + SMS (Twilio)
- Role system: owner / manager / employee
- Avatar initials everywhere
- Profile page (edit personal info, change email/password)
- Tasks: create/assign, templates, status tracking (managers only)
- Internal messages + newsfeed/announcements
- Push notifications
- Settings with sub-nav + toggle switches
- Pro badges on premium features
- Employee "next shift" banner
- 105 rotating fun facts in public/nuggets.json (never repeats)
- Left sidebar nav
- Security: JWT, bcrypt, rate limiting, RBAC, helmet, token cleanup

## 🔲 Still To Do
- [ ] Clicking avatar/name in header opens profile modal
- [ ] Compact time-off/unavailability forms (40% less vertical space)
- [ ] Swap button on shift blocks in schedule view
- [ ] Upsell cards for Pro features (not just badges)
- [ ] Daily email report for managers
- [ ] Notification preferences per channel (email/push/web)
- [ ] Clock in/out
- [ ] Payroll export
- [ ] Production deployment (update APP_URL, run DB migrations on prod)
- [ ] End-to-end invite flow test

## Key Files
- src/App.jsx — entire frontend (~3500 lines, single file)
- src/index.css — global styles + print styles
- server/src/index.js — Express API
- server/.env — secrets (NOT in git)
- tailwind.config.js — brand colors safelisted
- public/nuggets.json — fun facts pool
- scripts/add_nuggets.sh — weekly cron to add nuggets

## Critical Rules
- Do NOT break existing features
- Do NOT commit .env
- Read src/App.jsx fully before making changes
- Keep all hooks (useMemo, useState, useEffect) ABOVE any early returns — hooks violation crashes the app
- Brand colors are safelisted in tailwind.config.js — use them freely
- Commit after every meaningful change
