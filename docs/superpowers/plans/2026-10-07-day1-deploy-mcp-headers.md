# Day 1 — Vercel Deploy, MCP Tooling, Security Headers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The existing app is live on Vercel with hardened HTTP security headers, and Claude Code is connected to the Supabase and Vercel MCP servers for the rest of the week.

**Architecture:** A single `vercel.json` is the source of truth for SPA routing and security headers. `vite.config.ts` reads the same file so `npm run preview` serves identical headers locally — the CSP is exercised before it reaches production. MCP servers are registered at project scope in `.mcp.json` (no secrets; OAuth in the browser) and committed, documenting the vibe-coding workflow.

**Tech Stack:** Vite 8, React 19, react-router 7 (`BrowserRouter`), Vitest 4, Vercel (static hosting), Claude Code MCP (HTTP transport).

**Spec:** [docs/superpowers/specs/2026-10-07-submission-design.md](../specs/2026-10-07-submission-design.md) — §2 Architecture, §3.2 "Web hardening", §5.3 MCP (development), §8 Day 1.

## Global Constraints

- Server code later lives in `/api` (Vercel functions) — the SPA rewrite must **not** capture `/api/*`.
- Supabase project region: EU (Frankfurt) — CSP `connect-src` must allow `https://*.supabase.co` and `wss://*.supabase.co` now so Day 2 needs no header change.
- Stripe is hosted Checkout (redirect) — `form-action` allows `https://checkout.stripe.com`.
- Secrets are never committed or pasted into chat; `.env*` is already git-ignored (except `.env.example`).
- Fonts come from Google Fonts (`index.html` `<link>` and `src/ui/tokens.css` `@import`) — CSP must allow `fonts.googleapis.com` (styles) and `fonts.gstatic.com` (font files).
- Work is committed on `main` (the project's established practice); every push to `main` deploys to production once Task 3 is done.

## Review Focus

1. **Refreshing a deep link** (`/reports`, `/settings`) on the live site → must render the app, not a Vercel 404. Pinned in Task 1 (rewrite test) and Task 3 (curl check).
2. **CSP blocking the app's own assets** (fonts, react-day-picker CSS, Vite chunks) → page must look identical to `npm run dev`. Pinned in Task 1 Step 7 (preview with headers, zero CSP console errors).
3. **Future `/api/*` requests swallowed by the SPA rewrite** → must reach functions. Pinned in Task 1 (rewrite test negative case).
4. **Headers missing on the live site** (e.g. `vercel.json` ignored) → `curl -I` must show them. Pinned in Task 3 Step 4.
5. **Inline script/style injected by a library at runtime** violating CSP → caught by the same console check in Task 1 Step 7; if it occurs, fix by allowing the specific source, never `'unsafe-inline'` for scripts.

---

## File Structure

| File | Responsibility |
|---|---|
| `vercel.json` (create) | SPA rewrite + security headers — single source of truth |
| `src/test/vercelConfig.test.ts` (create) | Asserts headers/CSP/rewrite rules in `vercel.json` |
| `vite.config.ts` (modify) | Apply `vercel.json` headers to `vite preview` |
| `tsconfig.app.json`, `tsconfig.node.json` (modify) | `resolveJsonModule: true` so both can import `vercel.json` |
| `.mcp.json` (create, via `claude mcp add`) | Project-scoped Supabase + Vercel MCP servers |
| `README.md` (create) | Live URL, scripts, how the project is built with Claude Code + MCP |

---

### Task 1: Security headers and SPA routing in `vercel.json`

**Files:**
- Create: `vercel.json`
- Create: `src/test/vercelConfig.test.ts`
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`, `tsconfig.node.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `vercel.json` with `headers[0].source === "/(.*)"` and `rewrites[0].source === "/((?!api/).*)"`. Later days add origins to the CSP string in this file only.

- [ ] **Step 1: Install dependencies** (`node_modules` is absent)

Run: `npm ci`
Expected: completes without errors.

- [ ] **Step 2: Enable JSON imports**

In `tsconfig.app.json` and `tsconfig.node.json`, add inside `compilerOptions` (after `"moduleDetection": "force",`):

```json
    "resolveJsonModule": true,
```

- [ ] **Step 3: Write the failing test** — `src/test/vercelConfig.test.ts`

```ts
import config from '../../vercel.json';

type Header = { key: string; value: string };

function globalHeaders(): Map<string, string> {
  const block = config.headers.find((h) => h.source === '/(.*)');
  expect(block, 'a header block for every path').toBeDefined();
  return new Map(block!.headers.map((h: Header) => [h.key.toLowerCase(), h.value]));
}

function csp(): Map<string, string> {
  const raw = globalHeaders().get('content-security-policy');
  expect(raw, 'CSP header').toBeDefined();
  return new Map(
    raw!
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values.join(' ')] as [string, string];
      }),
  );
}

describe('vercel.json security headers', () => {
  it('sets the baseline hardening headers', () => {
    const h = globalHeaders();
    expect(h.get('strict-transport-security')).toMatch(/max-age=\d{8,}; includeSubDomains/);
    expect(h.get('x-content-type-options')).toBe('nosniff');
    expect(h.get('x-frame-options')).toBe('DENY');
    expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(h.get('permissions-policy')).toContain('camera=()');
    expect(h.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('CSP forbids inline/eval scripts and framing', () => {
    const p = csp();
    expect(p.get('default-src')).toBe("'self'");
    expect(p.get('script-src')).toBe("'self'");
    expect(p.get('object-src')).toBe("'none'");
    expect(p.get('frame-ancestors')).toBe("'none'");
    expect(p.get('base-uri')).toBe("'self'");
  });

  it('CSP allows exactly the third parties the app uses', () => {
    const p = csp();
    expect(p.get('style-src')).toContain('https://fonts.googleapis.com');
    expect(p.get('font-src')).toContain('https://fonts.gstatic.com');
    expect(p.get('connect-src')).toContain('https://*.supabase.co');
    expect(p.get('connect-src')).toContain('wss://*.supabase.co');
    expect(p.get('form-action')).toContain('https://checkout.stripe.com');
  });
});

describe('vercel.json SPA rewrite', () => {
  const rewrite = config.rewrites[0];
  const matches = (path: string) => new RegExp(`^${rewrite.source}$`).test(path);

  it('serves index.html for client-side routes (deep-link refresh)', () => {
    expect(rewrite.destination).toBe('/index.html');
    expect(matches('/')).toBe(true);
    expect(matches('/reports')).toBe(true);
    expect(matches('/settings/profile')).toBe(true);
  });

  it('never captures serverless functions under /api', () => {
    expect(matches('/api/stripe-webhook')).toBe(false);
    expect(matches('/api/mcp')).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/test/vercelConfig.test.ts`
Expected: FAIL — `Failed to resolve import "../../vercel.json"`.

- [ ] **Step 5: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests"
        },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    }
  ]
}
```

- [ ] **Step 6: Run test to verify it passes, then the full suite**

Run: `npx vitest run src/test/vercelConfig.test.ts` → Expected: 5 passed.
Run: `npm test` → Expected: all tests pass (no regressions).

- [ ] **Step 7: Serve the same headers from `vite preview` and smoke-check the CSP**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vercel from './vercel.json';

// Production headers live in vercel.json; `vite preview` serves the same set so
// the CSP is exercised locally before it ships.
const productionHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers: productionHeaders },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
```

Run: `npm run build && npm run preview`
Open `http://localhost:4173` and `http://localhost:4173/reports` (direct load). Check the browser DevTools console.
Expected: build succeeds; both pages render with the Rubik/Assistant fonts and the calendar styled; **zero** `Content-Security-Policy` violations in the console. (Note: `upgrade-insecure-requests` and HSTS are harmless on localhost.) If `/reports` 404s locally that is Vite preview's behavior only — the Vercel rewrite is verified in Task 3.

If a violation appears: add only the specific origin it names to the matching directive in `vercel.json`, add an assertion for it in the test, re-run Steps 6–7.

- [ ] **Step 8: Lint and commit**

Run: `npm run lint` → Expected: no errors.

```bash
git add vercel.json vite.config.ts tsconfig.app.json tsconfig.node.json src/test/vercelConfig.test.ts
git commit -m "feat(deploy): vercel.json with SPA rewrite and security headers (CSP, HSTS)"
```

---

### Task 2: Connect Supabase and Vercel MCP servers

**Files:**
- Create: `.mcp.json` (written by `claude mcp add --scope project`)

**Interfaces:**
- Consumes: nothing.
- Produces: MCP servers named `supabase` and `vercel`, available to Claude Code in this project from the next session on (Days 2–7 use them for migrations and deployment checks).

- [ ] **Step 1: Register the servers (project scope)**

```bash
claude mcp add --scope project --transport http supabase https://mcp.supabase.com/mcp
claude mcp add --scope project --transport http vercel https://mcp.vercel.com
```

Expected: `.mcp.json` created containing both servers, no tokens in it.

- [ ] **Step 2: Verify the file contains no secrets**

Run: `cat .mcp.json`
Expected: only `type`/`url` fields for `supabase` and `vercel`.

- [ ] **Step 3: [USER] Create accounts and authenticate**

1. Create free accounts at supabase.com and vercel.com (Vercel: "Continue with GitHub").
2. Reload the Claude Code panel in VS Code (the new servers load on session start) and approve the project MCP servers when prompted.
3. Run `/mcp` → select `supabase` → Authenticate (browser OAuth). Repeat for `vercel`.

Expected: `/mcp` shows both as connected.

- [ ] **Step 4: Verify from Claude Code**

Ask Claude to list Supabase organizations (Supabase MCP) and list Vercel teams (Vercel MCP).
Expected: both return the user's account data.

- [ ] **Step 5: Commit**

```bash
git add .mcp.json
git commit -m "chore(mcp): register Supabase and Vercel MCP servers for development"
```

---

### Task 3: First production deploy on Vercel + README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `vercel.json` (Task 1); GitHub repo `lea-zukerman/Hours-Tracker`.
- Produces: the production URL (recorded in `README.md`), auto-deploy on every push to `main`.

- [ ] **Step 1: Push Day 1 commits**

Run: `git push origin main`

- [ ] **Step 2: [USER] Import the project in Vercel**

vercel.com → Add New… → Project → import `lea-zukerman/Hours-Tracker` → Framework Preset: **Vite** (auto-detected; build `npm run build`, output `dist`) → Deploy.
Expected: deployment "Ready"; note the production URL (e.g. `https://hours-tracker-xxxx.vercel.app`).

- [ ] **Step 3: Verify deep-link routing on the live site**

Run (replace `$URL`): `curl -s -o /dev/null -w "%{http_code}\n" $URL/reports`
Expected: `200`. Then open `$URL/reports` in the browser and refresh — the Reports page renders.

- [ ] **Step 4: Verify security headers on the live site**

Run: `curl -sI $URL | grep -iE "content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener"`
Expected: all seven headers present with the values from `vercel.json`.
Open `$URL` in the browser: fonts load, zero CSP violations in the console.
Optional external check: securityheaders.com on `$URL` → expect grade A or A+ (keep the screenshot for the submission).

- [ ] **Step 5: Write `README.md`**

```markdown
# מעקב שעות עבודה — Hours Tracker

Personal work-hours tracker for Israeli employees: live clock, manual entry, absences, monthly quota, alerts, reports.

**Live:** <PRODUCTION URL FROM STEP 2>

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
```

Replace `<PRODUCTION URL FROM STEP 2>` with the real URL before committing.

- [ ] **Step 6: Commit and confirm auto-deploy**

```bash
git add README.md
git commit -m "docs: README with live URL, security headers and MCP workflow"
git push origin main
```

Expected: Vercel starts a new production deployment automatically (visible in the Vercel dashboard, or via Vercel MCP "list deployments"), status Ready.
