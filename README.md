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

## How it was built — Claude Code + MCP
Built with Claude Code. Project-scoped MCP servers ([`.mcp.json`](.mcp.json)) connect the agent to **Supabase** (schema, migrations, RLS) and **Vercel** (deployments, logs). Product docs: [SPEC](docs/SPEC.md) · [DESIGN](docs/DESIGN.md) · [TASKS](docs/TASKS.md).
