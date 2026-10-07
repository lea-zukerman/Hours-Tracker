# מעקב שעות עבודה — Hours Tracker

Personal work-hours tracker for Israeli employees: live clock, manual entry, absences, monthly quota, alerts, reports.

**Live:** https://hours-tracker-seven-liart.vercel.app

## Stack
React 19 · TypeScript · Vite · TanStack Query · Luxon · Vitest — deployed on Vercel.
Planned this week: Supabase (auth + Postgres + RLS), Gmail SMTP email, Stripe (test mode).

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit + component tests |
| `npm run build && npm run preview` | Production build served locally **with the production security headers** |
| `npm run lint` | ESLint |

## Security
HTTP hardening is defined in [`vercel.json`](vercel.json): strict CSP (no inline scripts), HSTS, clickjacking and MIME-sniffing protection. Full security design: [docs/superpowers/specs/2026-10-07-submission-design.md §3](docs/superpowers/specs/2026-10-07-submission-design.md).

### Authentication & data protection
- Supabase Auth (EU region, Frankfurt): verified email, password policy (10+ chars, mixed case, digit, symbol), optional TOTP 2FA.
- Every table has Row-Level Security (`user_id = auth.uid()`); once a user enables 2FA, restrictive policies require an `aal2` session at the database level.
- Sign-up requires explicit privacy consent (UI + database trigger); `profiles.plan` is not user-writable.
- Data changes are written to an immutable per-user `audit_log`. Logins are captured by Supabase Auth's log stream (short retention on the Free plan); persisting them in the database for long-term retention is scheduled for the privacy work (Day 4).
- Security tests: [`supabase/tests/`](supabase/tests/) — see [supabase/README.md](supabase/README.md).

> Note: until custom SMTP is configured, confirmation emails are delivered only to project members.

## How it was built — Claude Code + MCP
Built with Claude Code. Project-scoped MCP servers ([`.mcp.json`](.mcp.json)) connect the agent to **Supabase** (schema, migrations, RLS) and **Vercel** (deployments, logs). Product docs: [SPEC](docs/SPEC.md) · [DESIGN](docs/DESIGN.md) · [TASKS](docs/TASKS.md).
