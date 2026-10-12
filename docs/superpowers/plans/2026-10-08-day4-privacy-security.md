# Day 4 — Privacy & Security Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Security and the legal base are complete for submission. A user can delete their account and all its data. Public privacy, terms and accessibility-statement pages, under the new brand "כל שעה", are linked from sign-up consent and from a footer on every page. The first server endpoint is rate-limited and input-validated, the database rejects oversized payloads and records who made each change, and the two security documents the Israeli Data Security Regulations call for exist.

**Architecture:** The first Vercel function, `POST /api/delete-account`, sets up the `/api` pattern that Day 5 and Day 6 reuse. It uses a Web-standard handler, injected dependencies so it can be unit-tested, zod for input, a Postgres-backed fixed-window rate limiter that fails closed, and a server-only Supabase client with the secret key. The handler verifies the caller's access token. If the account has 2FA, it also requires an `aal2` session. It checks that the typed email matches and then deletes the auth user, and every user-data row cascades. `audit_log` rows are kept, marked `actor = 'system'`. The privacy page is the app's first public route. Everything else is still behind `AuthGate`.

**Tech Stack:** Vercel Functions (Node runtime, `export function POST(request: Request)`), zod 4, supabase-js v2 admin API, Postgres (plpgsql, RLS), React 19 + react-router 7, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-08-kol-shaa-week-design.md](../specs/2026-10-08-kol-shaa-week-design.md). Its §1 (brand), §5 (legal compliance: terms, privacy, accessibility statement, footer, consent) and §11 Friday row are covered here; the rest belongs to later days. That spec builds on [docs/superpowers/specs/2026-10-07-submission-design.md](../specs/2026-10-07-submission-design.md), §3 (Security: data-subject rights, web hardening, documentation), §8 Day 4 ("Account deletion, privacy policy + consent, rate limiting, security documents"). Day 2/3 review backlog items are folded in where they are security- or data-loss-related.

## Global Constraints

- Supabase project ref **`ialmhinwdtqevksckton`** (eu-central-1). The user runs SQL **tests** in Dashboard → SQL Editor (`https://supabase.com/dashboard/project/ialmhinwdtqevksckton/sql/new`). Migrations go through MCP `apply_migration`. If it is declined, the user runs the file in the SQL Editor and records it with `insert into supabase_migrations.schema_migrations(version, name) values ('<version>', 'day4_hardening');`. Migration file name = `<applied version>_day4_hardening.sql`.
- **Secrets:** the Supabase secret key lives only in the Vercel env var `SUPABASE_SECRET_KEY` (type *Sensitive*, Production + Preview), entered by the user. It never goes in the repo, chat, `.env.example` values or anything under `src/`. Code under `src/` never imports from `api/`. `api/` imports from `src/` only with `import type` (erased at build).
- `/api` conventions: Web-standard named exports (`export function POST(request: Request): Promise<Response>`). Relative imports carry a **`.js`** extension (Node ESM after transpile). Shared code goes in `api/_lib/` and tests in `api/_tests/`, because Vercel does not deploy underscore-prefixed paths as functions.
- Every `/api` input is validated with zod (`z.strictObject`). Responses are JSON with `Cache-Control: no-store`. Error bodies are `{ error: <code> }` with a closed set of codes, never internal messages. Logs never contain tokens, emails or request bodies.
- Rate limiting **fails closed**: if the limiter cannot answer, the request is refused (`503`) and nothing is changed.
- UI copy is Hebrew and addresses the user in the plural/neutral form already used in the app ("הקלידו", "נסו").
- Visible brand is **"כל שעה"** (slogan "כל שעה נחשבת"). Code, repo and URLs stay `hours-tracker`. Brand and legal contact come only from `src/features/legal/contact.ts`.
- The privacy policy and accessibility statement describe only what exists on the day they ship. The terms include the Pro subscription terms from the start, with prices fixed by the spec. Later days extend the privacy policy (wage, Gemini, Stripe, Gmail, employer report) and the accessibility statement (after the Tuesday pass) in their own plans.
- Format only touched files with prettier (`npx prettier --write <files>`), never a whole directory (CRLF churn on Windows).
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Every push to `main` deploys. Ask the user before each push.
- New dependencies: `zod@^4.6.5` (dependency), `@types/node@^22` (devDependency).

## Review Focus

1. **A session that skipped 2FA (aal1) on an account that has 2FA tries to delete the account.** It must be refused (403) and nothing deleted. Pinned: Task 2, "requires a 2FA-verified session when the account has 2FA".
2. **The typed confirmation email differs only in case or surrounding spaces**, so it should be accepted. **A different address** must be refused and nothing deleted. Pinned: Task 2, "deletes the caller when the typed email matches, in any letter case" and "refuses a mismatched email and deletes nothing".
3. **The rate-limit table/function is unreachable or errors.** No deletion, 503, not a silent pass. Pinned: Task 2, "fails closed with 503 when the rate limiter is unavailable".
4. **Supabase cannot be reached when the app starts.** The user gets a message and a retry button, not an endless "טוען…". Pinned: Task 5, "offers a retry when the server cannot be reached, instead of loading forever".
5. **A file that is not a backup (or a backup with no data) is chosen for restore.** An invalid file changes nothing and says so. A valid one asks first, shows what will replace the account's data, and cancelling changes nothing. Pinned: Task 6, the three restore tests.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<version>_day4_hardening.sql` | Linter-clean MFA policies; bounded jsonb; `audit_log.actor`; `private.rate_limits` + `public.rate_limit_hit()` (service_role only) |
| `supabase/tests/hardening.sql` | Proves the above |
| `supabase/tests/rls_isolation.sql` (modify) | + settings isolation, anon writes, aal1 writes with 2FA enrolled (Day 2 review backlog) |
| `src/data/database.types.ts` | Regenerated (adds `rate_limit_hit`, `audit_log.actor`) |
| `api/_lib/http.ts` | `json()`, `bearerToken()`, `clientIp()`, `readJson()` |
| `api/_lib/supabaseAdmin.ts` | Server-only client with the secret key |
| `api/_lib/caller.ts` | `verifyCaller()` (token → id, email, aal, 2FA enrolled), `aalOf()` |
| `api/_lib/rateLimit.ts` | `allow()` over `rate_limit_hit` |
| `api/delete-account.ts` | `createDeleteAccountHandler(deps)` + `POST` |
| `api/_tests/delete-account.test.ts`, `api/_tests/caller.test.ts` | Handler + claim tests (node environment) |
| `tsconfig.api.json`, `tsconfig.json`, `eslint.config.js` (modify) | Type-check and lint `api/` as Node ESM |
| `src/auth/AuthService.ts`, `SupabaseAuthService.ts`, `src/test/fakeAuth.ts`, `src/features/auth/messages.ts` (modify) | `deleteAccount()`, `disableMfa(code)`, `email_mismatch`, fail-closed assurance |
| `src/features/settings/DeleteAccountCard.tsx` (+test) | The deletion UI |
| `src/features/legal/` (`contact.ts`, `LegalPage.tsx`, `LegalFooter.tsx`, `PrivacyPage.tsx`, `TermsPage.tsx`, `AccessibilityPage.tsx`, `legal.css`, +test) | Brand and contact constants, the three public legal pages, footer |
| `src/app/AppRoutes.tsx` (+test) | Public `/privacy`, `/terms`, `/accessibility`; everything else behind `AuthGate` |
| `src/i18n/he.ts`, `index.html` (modify) | Brand "כל שעה" |
| `src/main.tsx`, `src/app/App.tsx`, `src/features/auth/LoginPage.tsx` (modify) | Wiring, legal footer, consent links (terms + privacy + 18+) |
| `src/auth/AuthContext.tsx`, `src/features/auth/AuthGate.tsx`, `src/features/settings/MfaCard.tsx` (modify) | Error state + retry; code required to disable 2FA |
| `src/domain/validation.ts`, `src/features/reports/ReportsPage.tsx` (modify, +tests) | Whole minutes; restore asks first and rejects bad files |
| `docs/security/DATABASE-DEFINITION.md`, `docs/security/SECURITY-PROCEDURE.md` | מסמך הגדרות מאגר, נוהל אבטחת מידע |
| `.github/dependabot.yml`, `README.md`, `supabase/README.md`, `.env.example` (modify) | Supply chain + docs |

---

### Task 1: Database — server-only rate limiter

**Files:**
- Create: `supabase/tests/rate_limit.sql`, `supabase/migrations/<version>_rate_limit.sql`
- Modify: `src/data/database.types.ts`

**Interfaces:**
- Consumes: the Day 2 `private` schema.
- Produces: `public.rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean`. It returns true when the hit is allowed and is executable by `service_role` only. Generated types: `Database['public']['Functions']['rate_limit_hit']` with `Args: { p_key: string; p_max: number; p_window_seconds: number }` and `Returns: boolean`. The AI quota (Monday) and email limits reuse this function.

- [ ] **Step 1: Write the failing SQL test** — `supabase/tests/rate_limit.sql`

```sql
-- Rate limiter test. Paste into Dashboard → SQL Editor and Run; everything rolls back.
-- Success: one row "rate_limit: all checks passed". Failure: an exception naming the check.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', 'a4@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}');

-- 1. Fixed-window rate limiter: max 2 per window, then refused; a new window resets.
do $$ begin
  if not public.rate_limit_hit('test:k', 2, 60) then raise exception 'FAIL 1a: first hit refused'; end if;
  if not public.rate_limit_hit('test:k', 2, 60) then raise exception 'FAIL 1b: second hit refused'; end if;
  if public.rate_limit_hit('test:k', 2, 60) then raise exception 'FAIL 1c: third hit allowed'; end if;
  update private.rate_limits set window_start = now() - interval '2 minutes' where key = 'test:k';
  if not public.rate_limit_hit('test:k', 2, 60) then raise exception 'FAIL 1d: window did not reset'; end if;
end $$;

-- 2. Only the server (service_role) may call the limiter.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  begin
    perform public.rate_limit_hit('test:x', 1, 60);
    raise exception 'FAIL 2a: authenticated can call rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.rate_limit_hit('test:x', 1, 60);
    raise exception 'FAIL 2b: anon can call rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role service_role;
do $$ begin
  if not public.rate_limit_hit('test:y', 1, 60) then raise exception 'FAIL 2c: service_role refused'; end if;
end $$;
reset role;

select 'rate_limit: all checks passed' as result;
rollback;
```

- [ ] **Step 2: User runs it — verify RED**

Ask the user to paste `supabase/tests/rate_limit.sql` into the SQL Editor and Run.
Expected: an error that `public.rate_limit_hit` does not exist.

- [ ] **Step 3: Write the migration** — `supabase/migrations/rate_limit.sql` (renamed with the applied version in Step 4)

```sql
-- Fixed-window rate limiter for /api (spec §3.2 "rate limiting on /api"). The table
-- is in `private` (not exposed by the Data API); only the server's service_role
-- may call the function.
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);

create function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
```

- [ ] **Step 4: Apply.** Use MCP `apply_migration` (name `rate_limit`, query = the file content), then `list_migrations`. Expected: 5 migrations, the last one `rate_limit`. Rename the file to `supabase/migrations/<that version>_rate_limit.sql`. If `apply_migration` is declined, follow the Global Constraints fallback.

- [ ] **Step 5: User reruns the test — verify GREEN.** Expected: `rate_limit: all checks passed`.

- [ ] **Step 6: Regenerate types.** Write MCP `generate_typescript_types` output to `src/data/database.types.ts`, then run `npx prettier --write src/data/database.types.ts`.
Check: `git diff src/data/database.types.ts` shows only the new `rate_limit_hit` function. Then `npx tsc -b`. Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations supabase/tests/rate_limit.sql src/data/database.types.ts
git commit -m "feat(db): server-only fixed-window rate limiter for /api"
```

---

### Task 2: `/api` foundation and `POST /api/delete-account`

**Files:**
- Create: `api/_lib/http.ts`, `api/_lib/supabaseAdmin.ts`, `api/_lib/caller.ts`, `api/_lib/rateLimit.ts`, `api/delete-account.ts`, `api/_tests/delete-account.test.ts`, `api/_tests/caller.test.ts`, `tsconfig.api.json`
- Modify: `tsconfig.json`, `eslint.config.js`, `package.json` (deps), `.env.example`

**Interfaces:**
- Consumes: `rate_limit_hit` and the generated `Database` type (Task 1).
- Produces: HTTP contract used by Task 3:
  - `POST /api/delete-account`, header `Authorization: Bearer <access token>`, body `{"confirmEmail": string}`.
  - `200 {"ok": true}`: the account and all its data are deleted.
  - `400 {"error": "invalid_input" | "email_mismatch"}`, `401 {"error": "unauthorized"}`, `403 {"error": "mfa_required"}`, `429 {"error": "rate_limited"}`, `503 {"error": "unavailable"}`.
  - Exported for tests: `createDeleteAccountHandler(deps: DeleteAccountDeps): (request: Request) => Promise<Response>`, `interface Caller { id: string; email: string; aal: 'aal1' | 'aal2'; mfaEnrolled: boolean }` (email lower-cased), `aalOf(token: string): 'aal1' | 'aal2'`.

- [ ] **Step 1: Install dependencies**

Run: `npm install zod@^4.6.5` and then `npm install -D @types/node@^22`
Expected: both added to `package.json`, no errors.

- [ ] **Step 2: TypeScript and lint config for `api/`**

`tsconfig.api.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
    "noEmit": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.api.tsbuildinfo",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "types": ["node", "vitest/globals"]
  },
  "include": ["api"]
}
```

`tsconfig.json`: add `{ "path": "./tsconfig.api.json" }` to `references`.

`eslint.config.js`: add this block after the main config object, before `prettier`:
```js
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
```

`.env.example`: append
```
# Server only (Vercel env var, type Sensitive) — never VITE_-prefixed, never in the browser.
SUPABASE_SECRET_KEY=sb_secret_xxx
```

- [ ] **Step 3: Write the failing tests**

`api/_tests/caller.test.ts`:
```ts
// @vitest-environment node
import { aalOf } from '../_lib/caller.js';

const tokenWith = (payload: object) =>
  ['header', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');

describe('aalOf', () => {
  it('reads the aal claim of a verified token', () => {
    expect(aalOf(tokenWith({ aal: 'aal2' }))).toBe('aal2');
    expect(aalOf(tokenWith({ aal: 'aal1' }))).toBe('aal1');
  });

  it('treats a missing or unreadable claim as aal1 (never as 2FA-verified)', () => {
    expect(aalOf(tokenWith({}))).toBe('aal1');
    expect(aalOf('not-a-jwt')).toBe('aal1');
  });
});
```

`api/_tests/delete-account.test.ts`:
```ts
// @vitest-environment node
import { vi } from 'vitest';
import { createDeleteAccountHandler, type DeleteAccountDeps } from '../delete-account.js';
import type { Caller } from '../_lib/caller.js';

const ALICE: Caller = { id: 'u-alice', email: 'alice@example.com', aal: 'aal1', mfaEnrolled: false };

function setup(overrides: Partial<DeleteAccountDeps> = {}, caller: Caller = ALICE) {
  const deps = {
    verifyCaller: vi.fn(async (token: string) => (token === 'good-token' ? caller : null)),
    allow: vi.fn(async (_key: string, _max: number, _windowSeconds: number) => true),
    deleteUser: vi.fn(async (_userId: string) => {}),
    ...overrides,
  };
  return { deps, handle: createDeleteAccountHandler(deps) };
}

function request(body: unknown, token: string | null = 'good-token') {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': '203.0.113.7, 10.0.0.1',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('https://app.test/api/delete-account', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/delete-account', () => {
  it('deletes the caller when the typed email matches, in any letter case', async () => {
    const { deps, handle } = setup();
    const res = await handle(request({ confirmEmail: '  Alice@Example.com ' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true });
    expect(deps.deleteUser).toHaveBeenCalledWith('u-alice');
  });

  it('refuses a mismatched email and deletes nothing', async () => {
    const { deps, handle } = setup();
    const res = await handle(request({ confirmEmail: 'bob@example.com' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'email_mismatch' });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid token with 401', async () => {
    const { deps, handle } = setup();
    expect((await handle(request({ confirmEmail: 'alice@example.com' }, null))).status).toBe(401);
    expect((await handle(request({ confirmEmail: 'alice@example.com' }, 'bad-token'))).status).toBe(401);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it('requires a 2FA-verified session when the account has 2FA', async () => {
    const enrolled = { ...ALICE, mfaEnrolled: true };
    const weak = setup({}, { ...enrolled, aal: 'aal1' });
    const res = await weak.handle(request({ confirmEmail: 'alice@example.com' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'mfa_required' });
    expect(weak.deps.deleteUser).not.toHaveBeenCalled();

    const strong = setup({}, { ...enrolled, aal: 'aal2' });
    expect((await strong.handle(request({ confirmEmail: 'alice@example.com' }))).status).toBe(200);
  });

  it('rejects malformed bodies', async () => {
    const bodies = ['not json', {}, { confirmEmail: 5 }, { confirmEmail: 'alice@example.com', extra: 1 }];
    for (const body of bodies) {
      const { deps, handle } = setup();
      const res = await handle(request(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_input' });
      expect(deps.deleteUser).not.toHaveBeenCalled();
    }
  });

  it('rate-limits by client IP before checking the token', async () => {
    const allow = vi.fn(async (key: string) => !key.startsWith('delete-account:ip:'));
    const { deps, handle } = setup({ allow });
    const res = await handle(request({ confirmEmail: 'alice@example.com' }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    expect(allow).toHaveBeenCalledWith('delete-account:ip:203.0.113.7', 10, 3600);
    expect(deps.verifyCaller).not.toHaveBeenCalled();
  });

  it('rate-limits each user', async () => {
    const allow = vi.fn(async (key: string) => !key.startsWith('delete-account:user:'));
    const { deps, handle } = setup({ allow });
    const res = await handle(request({ confirmEmail: 'alice@example.com' }));
    expect(res.status).toBe(429);
    expect(allow).toHaveBeenCalledWith('delete-account:user:u-alice', 5, 3600);
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the rate limiter is unavailable', async () => {
    const allow = vi.fn(async () => {
      throw new Error('db down');
    });
    const { deps, handle } = setup({ allow });
    const res = await handle(request({ confirmEmail: 'alice@example.com' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it('returns 503 when the deletion itself fails', async () => {
    const deleteUser = vi.fn(async () => {
      throw new Error('auth admin down');
    });
    const { handle } = setup({ deleteUser });
    expect((await handle(request({ confirmEmail: 'alice@example.com' }))).status).toBe(503);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run api`
Expected: FAIL. The modules `../delete-account.js` and `../_lib/caller.js` cannot be resolved.

- [ ] **Step 5: Implement `api/_lib/`**

`api/_lib/http.ts`:
```ts
/** JSON response that is never cached (bodies are per-user). */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** `Authorization: Bearer <token>` → token, else null. */
export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  return match ? match[1] : null;
}

/** The client's IP: first entry of x-forwarded-for, which Vercel's edge sets. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** Parsed JSON body, or null when it is empty, larger than `maxChars`, or not JSON. */
export async function readJson(request: Request, maxChars = 2048): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0 || text.length > maxChars) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
```

`api/_lib/supabaseAdmin.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/data/database.types.js';

export type AdminClient = SupabaseClient<Database>;

/**
 * Server-only Supabase client with the secret key. It bypasses RLS, so it must
 * never be imported from src/ (the browser bundle) and the key is read only
 * from the Vercel environment.
 */
export function createAdminClient(): AdminClient {
  const url = process.env.VITE_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error('Server misconfigured: VITE_SUPABASE_URL / SUPABASE_SECRET_KEY missing');
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`api/_lib/caller.ts`:
```ts
import type { AdminClient } from './supabaseAdmin.js';

/** The verified user behind a request. `email` is lower-cased. */
export interface Caller {
  id: string;
  email: string;
  aal: 'aal1' | 'aal2';
  mfaEnrolled: boolean;
}

/**
 * The `aal` claim of an access token that Supabase Auth has already verified.
 * Anything unreadable counts as aal1, so it can never pass a 2FA requirement.
 */
export function aalOf(token: string): 'aal1' | 'aal2' {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { aal?: unknown };
    return payload.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

/** Verify an access token with Supabase Auth; null when it is invalid or expired. */
export async function verifyCaller(admin: AdminClient, token: string): Promise<Caller | null> {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const factors = await admin.auth.admin.mfa.listFactors({ userId: data.user.id });
  if (factors.error) throw new Error(`listFactors: ${factors.error.message}`);
  return {
    id: data.user.id,
    email: (data.user.email ?? '').toLowerCase(),
    aal: aalOf(token),
    mfaEnrolled: factors.data.factors.some((f) => f.status === 'verified'),
  };
}
```

`api/_lib/rateLimit.ts`:
```ts
import type { AdminClient } from './supabaseAdmin.js';

/**
 * One hit against a fixed-window limit (public.rate_limit_hit). True = allowed.
 * Throws when the database cannot answer — callers fail closed.
 */
export async function allow(
  admin: AdminClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc('rate_limit_hit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`rate limit: ${error.message}`);
  return data === true;
}
```

- [ ] **Step 6: Implement `api/delete-account.ts`**

```ts
import { z } from 'zod';
import { bearerToken, clientIp, json, readJson } from './_lib/http.js';
import { verifyCaller, type Caller } from './_lib/caller.js';
import { allow } from './_lib/rateLimit.js';
import { createAdminClient } from './_lib/supabaseAdmin.js';

export interface DeleteAccountDeps {
  verifyCaller(token: string): Promise<Caller | null>;
  allow(key: string, max: number, windowSeconds: number): Promise<boolean>;
  deleteUser(userId: string): Promise<void>;
}

const Body = z.strictObject({ confirmEmail: z.string().trim().toLowerCase().max(254) });
const HOUR = 3600;

/**
 * POST /api/delete-account: the right to erasure (spec §3.2). Deletes the auth
 * user; profiles, settings, entries and absences cascade (FK on delete cascade).
 * audit_log rows stay (no FK; retention under the Data Security Regulations),
 * keeping only the pseudonymous user id.
 */
export function createDeleteAccountHandler(deps: DeleteAccountDeps) {
  return async function handle(request: Request): Promise<Response> {
    try {
      if (!(await deps.allow(`delete-account:ip:${clientIp(request)}`, 10, HOUR))) {
        return json(429, { error: 'rate_limited' });
      }
      const token = bearerToken(request);
      const caller = token ? await deps.verifyCaller(token) : null;
      if (!caller) return json(401, { error: 'unauthorized' });
      if (caller.mfaEnrolled && caller.aal !== 'aal2') return json(403, { error: 'mfa_required' });
      if (!(await deps.allow(`delete-account:user:${caller.id}`, 5, HOUR))) {
        return json(429, { error: 'rate_limited' });
      }

      const body = Body.safeParse(await readJson(request));
      if (!body.success) return json(400, { error: 'invalid_input' });
      if (body.data.confirmEmail !== caller.email) return json(400, { error: 'email_mismatch' });

      await deps.deleteUser(caller.id);
      return json(200, { ok: true });
    } catch (err) {
      console.error('delete-account failed:', err instanceof Error ? err.message : 'unknown');
      return json(503, { error: 'unavailable' });
    }
  };
}

function productionDeps(): DeleteAccountDeps {
  const admin = createAdminClient();
  return {
    verifyCaller: (token) => verifyCaller(admin, token),
    allow: (key, max, windowSeconds) => allow(admin, key, max, windowSeconds),
    deleteUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(`deleteUser: ${error.message}`);
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  let deps: DeleteAccountDeps;
  try {
    deps = productionDeps();
  } catch (err) {
    console.error('delete-account misconfigured:', err instanceof Error ? err.message : 'unknown');
    return json(503, { error: 'unavailable' });
  }
  return createDeleteAccountHandler(deps)(request);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run api`
Expected: PASS (11 tests).

- [ ] **Step 8: Full checks**

Run: `npx tsc -b`, then `npm run lint`, then `npm test`
Expected: no type or lint errors, and all tests pass (241 earlier + 11 new).

- [ ] **Step 9: Commit**

```bash
npx prettier --write api tsconfig.api.json tsconfig.json eslint.config.js .env.example
git add api tsconfig.api.json tsconfig.json eslint.config.js .env.example package.json package-lock.json
git commit -m "feat(api): delete-account endpoint with zod input, 2FA check and fail-closed rate limit"
```
(`api/` contains only new files, so formatting the directory is safe here.)

---

### Task 3: Account deletion in the app

**Files:**
- Modify: `src/auth/AuthService.ts`, `src/auth/SupabaseAuthService.ts`, `src/auth/SupabaseAuthService.test.ts`, `src/test/fakeAuth.ts`, `src/features/auth/messages.ts`, `src/app/App.tsx`
- Create: `src/features/settings/DeleteAccountCard.tsx`, `src/features/settings/DeleteAccountCard.test.tsx`

**Interfaces:**
- Consumes: the `/api/delete-account` contract (Task 2).
- Produces: `AuthService.deleteAccount(confirmEmail: string): Promise<AuthResult>`. On success the local session has ended. `AuthErrorCode` gains `'email_mismatch'`. `SupabaseAuthService` constructor: `(auth: SupabaseAuth, fetchFn: typeof fetch = (input, init) => fetch(input, init))`. `FakeAuthService` gains `deleteAccountResult: AuthResult | null` and `deletedAccounts: string[]`.

- [ ] **Step 1: Write the failing service tests** — append inside `describe('SupabaseAuthService', …)` in `src/auth/SupabaseAuthService.test.ts`:

```ts
  describe('deleteAccount', () => {
    const fakeResponse = (status: number, body: unknown) =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

    function signedIn() {
      const auth = fakeAuth();
      auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'tok', user: { id: 'u1', email: 'a@b.co' } } },
        error: null,
      });
      return auth;
    }

    it('posts the typed email with the access token, then ends the local session', async () => {
      const auth = signedIn();
      const fetchFn = vi.fn(async () => fakeResponse(200, { ok: true }));
      const service = new SupabaseAuthService(auth as unknown as SupabaseClient['auth'], fetchFn);
      expect(await service.deleteAccount('a@b.co')).toEqual({ ok: true, value: null });
      expect(fetchFn).toHaveBeenCalledWith('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: 'a@b.co' }),
      });
      expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('maps refusals to closed codes and keeps the session', async () => {
      const cases: [number, unknown, string][] = [
        [400, { error: 'email_mismatch' }, 'email_mismatch'],
        [429, { error: 'rate_limited' }, 'rate_limited'],
        [503, { error: 'unavailable' }, 'unknown'],
      ];
      for (const [status, body, code] of cases) {
        const auth = signedIn();
        const fetchFn = vi.fn(async () => fakeResponse(status, body));
        const service = new SupabaseAuthService(auth as unknown as SupabaseClient['auth'], fetchFn);
        expect(await service.deleteAccount('a@b.co')).toEqual({ ok: false, error: code });
        expect(auth.signOut).not.toHaveBeenCalled();
      }
    });

    it('reports a network failure', async () => {
      const fetchFn = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      });
      const service = new SupabaseAuthService(
        signedIn() as unknown as SupabaseClient['auth'],
        fetchFn,
      );
      expect(await service.deleteAccount('a@b.co')).toEqual({ ok: false, error: 'network' });
    });
  });
```

- [ ] **Step 2: Write the failing UI test** — `src/features/settings/DeleteAccountCard.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../auth/AuthContext.tsx';
import { DeleteAccountCard } from './DeleteAccountCard.tsx';
import { FakeAuthService } from '../../test/fakeAuth.ts';

const LABEL = 'לאישור, הקלידו את כתובת האימייל של החשבון';
const BUTTON = 'מחיקת החשבון לצמיתות';

function renderCard(service: FakeAuthService) {
  return render(
    <AuthProvider service={service}>
      <DeleteAccountCard />
    </AuthProvider>,
  );
}

describe('DeleteAccountCard', () => {
  it('enables deletion only after the account email is typed', async () => {
    renderCard(new FakeAuthService({ signedInAs: 'a@b.co' }));
    const button = await screen.findByRole('button', { name: BUTTON });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: 'other@b.co' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: ' A@B.co ' } });
    expect(button).toBeEnabled();
  });

  it('deletes the account and ends the session', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co' });
    renderCard(service);
    fireEvent.change(await screen.findByLabelText(LABEL), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(service.deletedAccounts).toEqual(['a@b.co']));
    expect(service.session).toBeNull();
  });

  it('shows the reason when deletion is refused', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co' });
    service.deleteAccountResult = { ok: false, error: 'rate_limited' };
    renderCard(service);
    fireEvent.change(await screen.findByLabelText(LABEL), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByRole('alert')).toHaveTextContent('יותר מדי ניסיונות');
    expect(service.session).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/auth/SupabaseAuthService.test.ts src/features/settings/DeleteAccountCard.test.tsx`
Expected: FAIL. `deleteAccount` is not a function, and `DeleteAccountCard.tsx` is not found.

- [ ] **Step 4: Implement the contract and services**

`src/auth/AuthService.ts`: add `| 'email_mismatch'` to `AuthErrorCode`, and add this to `AuthService`:
```ts
  /** Permanently delete the account and all its data (POST /api/delete-account); ends the session. */
  deleteAccount(confirmEmail: string): Promise<AuthResult>;
```

`src/features/auth/messages.ts`: add this entry to `AUTH_ERROR_MESSAGES`:
```ts
  email_mismatch: 'כתובת האימייל לא תואמת לחשבון',
```

`src/auth/SupabaseAuthService.ts`: change the constructor and add the method:
```ts
  private readonly auth: SupabaseAuth;
  private readonly fetchFn: typeof fetch;

  constructor(auth: SupabaseAuth, fetchFn: typeof fetch = (input, init) => fetch(input, init)) {
    this.auth = auth;
    this.fetchFn = fetchFn;
  }
```
```ts
  async deleteAccount(confirmEmail: string): Promise<AuthResult> {
    const { data } = await this.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return fail(null);
    let res: Response;
    try {
      res = await this.fetchFn('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail }),
      });
    } catch {
      return { ok: false, error: 'network' };
    }
    if (res.ok) {
      // The user no longer exists server-side: drop only the local session.
      await this.auth.signOut({ scope: 'local' });
      return ok(null);
    }
    if (res.status === 429) return { ok: false, error: 'rate_limited' };
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    return { ok: false, error: body.error === 'email_mismatch' ? 'email_mismatch' : 'unknown' };
  }
```

`src/test/fakeAuth.ts`: add these fields and the method:
```ts
  /** When set, deleteAccount returns it instead of deleting. */
  deleteAccountResult: AuthResult | null = null;
  readonly deletedAccounts: string[] = [];
```
```ts
  async deleteAccount(confirmEmail: string): Promise<AuthResult> {
    if (this.deleteAccountResult) return this.deleteAccountResult;
    const email = this.session?.email;
    if (!email || confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
      return { ok: false, error: 'email_mismatch' };
    }
    this.deletedAccounts.push(email);
    this.users.delete(email);
    this.expireSession();
    return ok(null);
  }
```

- [ ] **Step 5: Implement the card** — `src/features/settings/DeleteAccountCard.tsx`

```tsx
import { useState, type FormEvent } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useAuth } from '../../auth/AuthContext.tsx';
import { AUTH_ERROR_MESSAGES } from '../auth/messages.ts';

/** Right to erasure (spec §3.2): permanently delete the account and all its data. */
export function DeleteAccountCard() {
  const { state, service } = useAuth();
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'signed_in') return null;
  const matches = typed.trim().toLowerCase() === state.session.email.toLowerCase();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setError(null);
    setPending(true);
    try {
      const result = await service.deleteAccount(typed.trim());
      // On success the session ends and AuthGate shows the login screen.
      if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="מחיקת חשבון">
      <form className="te-form" onSubmit={(e) => void onSubmit(e)}>
        <p>
          המחיקה סופית: החשבון וכל הנתונים שבו (דיווחי שעות, היעדרויות והגדרות) יימחקו ולא יהיה אפשר
          לשחזר אותם. כדאי להוריד קודם גיבוי JSON בעמוד הדוחות.
        </p>
        <p className="auth-hint">
          יומן הפעולות (איזו פעולה בוצעה ומתי, בלי תוכן הנתונים) נשמר 24 חודשים לפחות, כנדרש בתקנות
          אבטחת המידע.
        </p>
        <label className="te-field">
          לאישור, הקלידו את כתובת האימייל של החשבון
          <input
            type="email"
            dir="ltr"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        <Button type="submit" variant="danger" disabled={!matches || pending}>
          מחיקת החשבון לצמיתות
        </Button>
      </form>
    </Card>
  );
}
```

`src/app/App.tsx`: import `DeleteAccountCard` and render it after `<MfaCard />` in the `/settings` route.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/auth src/features/settings`
Expected: PASS.

- [ ] **Step 7: Full checks and commit**

Run: `npx tsc -b`, `npm run lint`, `npm test`. Expected: all green.
```bash
npx prettier --write src/auth/AuthService.ts src/auth/SupabaseAuthService.ts src/auth/SupabaseAuthService.test.ts src/test/fakeAuth.ts src/features/auth/messages.ts src/features/settings/DeleteAccountCard.tsx src/features/settings/DeleteAccountCard.test.tsx src/app/App.tsx
git add src/auth src/test/fakeAuth.ts src/features/auth/messages.ts src/features/settings/DeleteAccountCard.tsx src/features/settings/DeleteAccountCard.test.tsx src/app/App.tsx
git commit -m "feat(settings): delete account and all its data, confirmed by typing the email"
```

---

### Task 4: Legal pages (privacy, terms, accessibility statement), legal footer, consent, brand "כל שעה"

**Files:**
- Create: `src/features/legal/contact.ts`, `src/features/legal/LegalPage.tsx`, `src/features/legal/LegalFooter.tsx`, `src/features/legal/PrivacyPage.tsx`, `src/features/legal/TermsPage.tsx`, `src/features/legal/AccessibilityPage.tsx`, `src/features/legal/legal.css`, `src/features/legal/LegalPages.test.tsx`, `src/app/AppRoutes.tsx`, `src/app/AppRoutes.test.tsx`
- Modify: `src/main.tsx`, `src/app/App.tsx`, `src/features/auth/LoginPage.tsx`, `src/features/auth/messages.ts`, `src/features/auth/AuthGate.test.tsx`, `src/i18n/he.ts`, `index.html`, `src/auth/SupabaseAuthService.ts`, `src/auth/SupabaseAuthService.test.ts`

**Interfaces:**
- Consumes: `AuthGate`, `AuthProvider`, `FakeAuthService`, `Card`.
- Produces:
  - `AppRoutes({ app }: { app: ReactNode })`: `/privacy`, `/terms` and `/accessibility` are public; every other path is `<AuthGate>{app}</AuthGate>`.
  - `LegalFooter()`: links to the three pages plus the contact email. Rendered on the legal pages, the login screen and inside the app.
  - Constants in `src/features/legal/contact.ts`: `BRAND = 'כל שעה'`, `SLOGAN = 'כל שעה נחשבת'`, `OWNER_NAME`, `CONTACT_EMAIL`, `LEGAL_UPDATED`.
  - Later days extend the privacy page (Gemini, Stripe, Gmail, employer report, wage) and the accessibility statement (after the Tuesday accessibility pass). Those edits belong to those days, and today's text describes only what exists today.

- [ ] **Step 1: Get the two values from the user.** Ask in Hebrew for:
  - (a) The owner name she chose to appear on the legal pages.
  - (b) The project Gmail address. Create the Gmail account now if it does not exist yet, because Day 5 needs it anyway.

  Do not continue this task without both values. Never use the user's personal address.

- [ ] **Step 2: Write the failing tests**

`src/features/legal/LegalPages.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage.tsx';
import { TermsPage } from './TermsPage.tsx';
import { AccessibilityPage } from './AccessibilityPage.tsx';
import { CONTACT_EMAIL, OWNER_NAME } from './contact.ts';

const renderPage = (page: React.ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>);

describe('legal pages', () => {
  it('privacy: names the owner and contact, where data is stored, and how to exercise each right', () => {
    renderPage(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: 'מדיניות פרטיות' })).toBeInTheDocument();
    expect(screen.getAllByText(OWNER_NAME, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(CONTACT_EMAIL, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(/פרנקפורט/)).toBeInTheDocument();
    expect(screen.getByText(/מחיקת חשבון/)).toBeInTheDocument();
    expect(screen.getByText(/גיבוי JSON/)).toBeInTheDocument();
  });

  it('terms: age limit, no legal advice, subscription price and online cancellation', () => {
    renderPage(<TermsPage />);
    expect(screen.getByRole('heading', { name: 'תקנון ותנאי שימוש' })).toBeInTheDocument();
    expect(screen.getByText(/18 ומעלה/)).toBeInTheDocument();
    expect(screen.getByText(/אינו ייעוץ משפטי/)).toBeInTheDocument();
    expect(screen.getByText(/14.90/)).toBeInTheDocument();
    expect(screen.getByText(/149/)).toBeInTheDocument();
    expect(screen.getByText(/ניהול מנוי/)).toBeInTheDocument();
  });

  it('accessibility statement: standard, coordinator contact and date', () => {
    renderPage(<AccessibilityPage />);
    expect(screen.getByRole('heading', { name: 'הצהרת נגישות' })).toBeInTheDocument();
    expect(screen.getByText(/5568/)).toBeInTheDocument();
    expect(screen.getAllByText(CONTACT_EMAIL, { exact: false }).length).toBeGreaterThan(0);
  });

  it('every legal page links to the other two from its footer', () => {
    renderPage(<TermsPage />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toContainElement(screen.getByRole('link', { name: 'מדיניות פרטיות' }));
    expect(footer).toContainElement(screen.getByRole('link', { name: 'הצהרת נגישות' }));
    expect(footer).toContainElement(screen.getByRole('link', { name: 'תקנון' }));
  });
});
```

`src/app/AppRoutes.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext.tsx';
import { AppRoutes } from './AppRoutes.tsx';
import { FakeAuthService } from '../test/fakeAuth.ts';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider service={new FakeAuthService()}>
        <AppRoutes app={<p>תוכן האפליקציה</p>} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  it.each([
    ['/privacy', 'מדיניות פרטיות'],
    ['/terms', 'תקנון ותנאי שימוש'],
    ['/accessibility', 'הצהרת נגישות'],
  ])('shows %s without signing in', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'התחברות' })).not.toBeInTheDocument();
  });

  it('keeps every other page behind login, with the legal footer visible', async () => {
    renderAt('/reports');
    expect(await screen.findByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
    expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'תקנון' })).toHaveAttribute('href', '/terms');
  });
});
```

`src/features/auth/AuthGate.test.tsx`: add the following inside the `describe`. The `renderGate` helper renders without a router, so this test wraps it in one:
```tsx
  it('sign-up consent links to the terms and the privacy policy and states the age limit', async () => {
    render(
      <MemoryRouter>
        <AuthProvider service={new FakeAuthService()}>
          <AuthGate>
            <p>תוכן האפליקציה</p>
          </AuthGate>
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'אין לך חשבון? להרשמה' }));
    const consent = screen.getByRole('checkbox').closest('label')!;
    expect(within(consent).getByRole('link', { name: 'תקנון' })).toHaveAttribute('href', '/terms');
    expect(within(consent).getByRole('link', { name: 'מדיניות הפרטיות' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(consent).toHaveTextContent('18 ומעלה');
  });
```
Add `within` to the `@testing-library/react` import, and `import { MemoryRouter } from 'react-router-dom';`. **Because `LoginPage` now renders `LegalFooter`, which uses `<Link>`, every existing `renderGate` render needs a router.** Change `renderGate` to wrap its tree in `<MemoryRouter>` (and do the same in any other test that renders `LoginPage` or `AuthGate`: `grep -rl "AuthGate\|LoginPage" src --include=*.test.tsx`).

`src/auth/SupabaseAuthService.test.ts`: in `'clears abandoned unverified factors before enrolling a new one'`, change the expected `friendlyName` to `'כל שעה'`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/legal src/app/AppRoutes.test.tsx src/features/auth src/auth/SupabaseAuthService.test.ts`
Expected: FAIL. The `legal/*` and `AppRoutes` modules are not found, there are no consent links, and `friendlyName` is still `'Hours Tracker'`.

- [ ] **Step 4: Implement**

`src/features/legal/contact.ts` (values from Step 1; `LEGAL_UPDATED` = execution date as dd/MM/yyyy):
```ts
/** Brand and the legal contact shown on the public pages (Privacy Protection Law §11 notice). */
export const BRAND = 'כל שעה';
export const SLOGAN = 'כל שעה נחשבת';
export const OWNER_NAME = '<the name the user gave in Step 1>';
export const CONTACT_EMAIL = '<the project Gmail address from Step 1>';
export const LEGAL_UPDATED = '<execution date, dd/MM/yyyy>';
```
(The executor writes the actual values. No angle-bracket text may remain in the committed file.)

`src/features/legal/LegalFooter.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from './contact.ts';

/** Legal links on every page (spec §5 "Footer"). */
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="מידע משפטי">
        <Link to="/terms">תקנון</Link>
        <Link to="/privacy">מדיניות פרטיות</Link>
        <Link to="/accessibility">הצהרת נגישות</Link>
      </nav>
      <p>
        יצירת קשר: <span dir="ltr">{CONTACT_EMAIL}</span>
      </p>
    </footer>
  );
}
```

`src/features/legal/LegalPage.tsx` is the shared frame for the three pages:
```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../ui/Card.tsx';
import { BRAND, LEGAL_UPDATED } from './contact.ts';
import { LegalFooter } from './LegalFooter.tsx';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <main className="app-shell legal">
        <p className="legal__brand">
          <Link to="/">{BRAND}</Link>
        </p>
        <Card title={title}>
          {children}
          <p className="auth-hint">עודכן לאחרונה: {LEGAL_UPDATED}</p>
        </Card>
      </main>
      <LegalFooter />
    </>
  );
}
```

`src/features/legal/PrivacyPage.tsx`:
```tsx
import { LegalPage } from './LegalPage.tsx';
import { BRAND, CONTACT_EMAIL, OWNER_NAME } from './contact.ts';

/** Public privacy notice (spec §5; Privacy Protection Law §11). Later days add Gemini, Stripe, Gmail and wage. */
export function PrivacyPage() {
  return (
    <LegalPage title="מדיניות פרטיות">
      <h3>מי אחראית על המידע</h3>
      <p>
        בעלת המאגר של {BRAND} והאחראית על אבטחת המידע: {OWNER_NAME}. לפניות בנושא פרטיות:{' '}
        <span dir="ltr">{CONTACT_EMAIL}</span>.
      </p>

      <h3>איזה מידע נשמר</h3>
      <ul>
        <li>כתובת אימייל וסיסמה. הסיסמה נשמרת רק כגיבוב מוצפן, ואיש אינו יכול לקרוא אותה.</li>
        <li>דיווחי שעות עבודה: תאריכים, שעות כניסה ויציאה, הפסקות והערות שכתבתם.</li>
        <li>
          היעדרויות: חופשה, מחלה, חג, מילואים או חופשה ללא תשלום, לפי תאריכים. לא נשמרות סיבות
          רפואיות או אבחנות.
        </li>
        <li>הגדרות: היקף משרה, מכסת שעות, ימי עבודה והעדפות התראה.</li>
        <li>יומן פעולות: איזו פעולה בוצעה (הוספה, עדכון, מחיקה), באיזו טבלה ומתי, בלי תוכן הנתונים.</li>
        <li>
          יומן התחברויות של שירות ההזדהות, הכולל כתובת IP, ומונה זמני לפי כתובת IP לצורך הגבלת קצב
          בקשות.
        </li>
      </ul>

      <h3>למה המידע נאסף</h3>
      <p>
        כדי להציג ולחשב את שעות העבודה והיתרות שלכם, לסנכרן בין המכשירים שלכם ולהגן על החשבון מפני
        שימוש לרעה. המידע לא משמש לפרסום, לא נמכר ולא מועבר לאחרים, מלבד ספקי התשתית שבהמשך. אין
        חובה חוקית למסור את המידע; הוא נמסר בהסכמתכם, ובלעדיו אי אפשר להשתמש בשירות.
      </p>

      <h3>איפה המידע נשמר</h3>
      <p>
        מסד הנתונים ושירות ההזדהות: Supabase, בשרתים בפרנקפורט שבגרמניה (האיחוד האירופי). אירוח
        האתר: Vercel. האיחוד האירופי הוא יעד שהתקנות בישראל מתירות להעביר אליו מידע אישי.
      </p>

      <h3>איך המידע מוגן</h3>
      <ul>
        <li>הצפנה בתעבורה (HTTPS) ובאחסון.</li>
        <li>כל משתמש רואה רק את הנתונים שלו, והכלל נאכף במסד הנתונים עצמו.</li>
        <li>אימות דו-שלבי אופציונלי. אחרי שהופעל, מסד הנתונים דורש אותו בכל גישה.</li>
        <li>יומן פעולות שמשתמשים אינם יכולים לשנות או למחוק.</li>
        <li>מפתחות הניהול נשמרים רק בשרת ולעולם לא מגיעים לדפדפן.</li>
      </ul>

      <h3>כמה זמן המידע נשמר</h3>
      <p>
        הנתונים נשמרים כל עוד החשבון קיים. כשמוחקים את החשבון, כל הנתונים נמחקים מיד. יומן
        הפעולות, שמזהה את החשבון במספר מזהה בלבד, נשמר לצורכי אבטחה 24 חודשים לפחות, כנדרש בתקנות
        אבטחת המידע.
      </p>

      <h3>הזכויות שלכם</h3>
      <ul>
        <li>עיון וקבלת עותק: "גיבוי JSON" בעמוד הדוחות מוריד את כל הנתונים שלכם.</li>
        <li>תיקון: אפשר לערוך כל דיווח, היעדרות והגדרה באפליקציה.</li>
        <li>מחיקה: הגדרות ← "מחיקת חשבון".</li>
        <li>
          לכל בקשה אחרת: <span dir="ltr">{CONTACT_EMAIL}</span>.
        </li>
      </ul>

      <h3>עוגיות ואחסון בדפדפן</h3>
      <p>
        האתר לא משתמש בעוגיות פרסום או מעקב. הדפדפן שומר אסימון התחברות כדי שלא תצטרכו להתחבר בכל
        כניסה.
      </p>
    </LegalPage>
  );
}
```

`src/features/legal/TermsPage.tsx`:
```tsx
import { LegalPage } from './LegalPage.tsx';
import { BRAND, CONTACT_EMAIL, OWNER_NAME } from './contact.ts';

/** Public terms of use (spec §5), including the Pro subscription terms. */
export function TermsPage() {
  return (
    <LegalPage title="תקנון ותנאי שימוש">
      <h3>השירות</h3>
      <p>
        {BRAND} הוא כלי אישי לרישום שעות עבודה והיעדרויות, ולחישוב זכויות עובדים לפי החוק הכללי
        בישראל. השירות מופעל על ידי {OWNER_NAME}.
      </p>

      <h3>מי יכול להשתמש</h3>
      <p>השירות מיועד לבני ובנות 18 ומעלה. ההרשמה מותנית בהסכמה לתקנון ולמדיניות הפרטיות.</p>

      <h3>החשבון שלכם</h3>
      <ul>
        <li>שמרו על הסיסמה בסוד. מומלץ להפעיל אימות דו-שלבי בהגדרות.</li>
        <li>הנתונים שלכם שייכים לכם: אפשר לייצא אותם בכל עת ולמחוק את החשבון בהגדרות.</li>
        <li>אסור להשתמש בשירות כדי לפגוע באחרים, לעקוף את מנגנוני האבטחה או להעמיס עליו.</li>
      </ul>

      <h3>חישובי זכויות ותשובות AI</h3>
      <p>
        החישובים נעשים לפי החוק הכללי בלבד, לשבוע עבודה של 5 ימים. הסכם קיבוצי, צו הרחבה או חוזה
        אישי עשויים להיטיב. המידע בשירות, כולל תשובות העוזר החכם, אינו ייעוץ משפטי ועלול לכלול
        טעויות. לפני פעולה מול מעסיק מומלץ לבדוק מול כל-זכות, ארגון עובדים או עורך דין.
      </p>

      <h3>מנוי Pro</h3>
      <ul>
        <li>מחיר: 14.90 ₪ לחודש, או 149 ₪ לשנה.</li>
        <li>המנוי מתחדש אוטומטית בסוף כל תקופה, עד לביטולו.</li>
        <li>
          ביטול: בכל עת, באינטרנט, בהגדרות ← "ניהול מנוי". הביטול נכנס לתוקף בסוף התקופה ששולמה, בלי
          דמי ביטול, והנתונים נשמרים.
        </li>
        <li>זכויות הביטול לפי חוק הגנת הצרכן לעסקה מרחוק חלות על המנוי.</li>
        <li>התשלום מתבצע אצל Stripe. פרטי כרטיס האשראי אינם מגיעים אלינו.</li>
      </ul>

      <h3>זמינות ושינויים</h3>
      <p>
        אנחנו עושים מאמץ שהשירות יהיה זמין ומדויק, אך אין התחייבות לזמינות רציפה. שינוי מהותי בתקנון
        יפורסם בעמוד זה.
      </p>

      <h3>דין ושיפוט</h3>
      <p>על התקנון חלים דיני מדינת ישראל.</p>

      <h3>יצירת קשר</h3>
      <p>
        <span dir="ltr">{CONTACT_EMAIL}</span>
      </p>
    </LegalPage>
  );
}
```

`src/features/legal/AccessibilityPage.tsx`. The text describes today's state honestly; the Tuesday accessibility pass updates it:
```tsx
import { LegalPage } from './LegalPage.tsx';
import { BRAND, CONTACT_EMAIL, OWNER_NAME } from './contact.ts';

/** Accessibility statement (spec §5; Equal Rights regulations, IS 5568). Updated after the Tuesday pass. */
export function AccessibilityPage() {
  return (
    <LegalPage title="הצהרת נגישות">
      <p>
        אנחנו רואים חשיבות בכך ש{BRAND} יהיה נגיש לכל אדם, כולל אנשים עם מוגבלות. אנחנו מתאימים את האתר
        לתקן ישראלי 5568 (המבוסס על הנחיות WCAG 2.0) ברמה AA, בהתאם לתקנות שוויון זכויות לאנשים עם
        מוגבלות.
      </p>

      <h3>מה כבר נעשה</h3>
      <ul>
        <li>האתר בעברית, עם כיווניות מימין לשמאל מוגדרת.</li>
        <li>לכל שדה בטופס יש תווית, והודעות שגיאה מוקראות על ידי קוראי מסך.</li>
        <li>אפשר להפעיל את כל הפעולות באמצעות המקלדת.</li>
      </ul>

      <h3>בתהליך</h3>
      <ul>
        <li>בדיקת נגישות מלאה לכל המסכים, כולל בדיקות אוטומטיות.</li>
        <li>תפריט נגישות: הגדלת טקסט, ניגודיות גבוהה, הדגשת קישורים ועצירת אנימציות.</li>
      </ul>

      <h3>נתקלתם בבעיה?</h3>
      <p>
        רכזת הנגישות: {OWNER_NAME}, <span dir="ltr">{CONTACT_EMAIL}</span>. נשמח לקבל פנייה ולתקן
        בהקדם.
      </p>
    </LegalPage>
  );
}
```

`src/features/legal/legal.css`:
```css
.legal-footer {
  margin-block: 2rem 1rem;
  text-align: center;
  font-size: 0.875rem;
}
.legal-footer nav {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1rem;
}
.legal__brand {
  font-weight: 700;
  font-size: 1.25rem;
}
```
Import it in `src/main.tsx` next to the other feature CSS files: `import './features/legal/legal.css';`.

`src/app/AppRoutes.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthGate } from '../features/auth/AuthGate.tsx';
import { PrivacyPage } from '../features/legal/PrivacyPage.tsx';
import { TermsPage } from '../features/legal/TermsPage.tsx';
import { AccessibilityPage } from '../features/legal/AccessibilityPage.tsx';

/** Public legal pages first; every other path requires a fully authenticated session. */
export function AppRoutes({ app }: { app: ReactNode }) {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/accessibility" element={<AccessibilityPage />} />
      <Route path="*" element={<AuthGate>{app}</AuthGate>} />
    </Routes>
  );
}
```

`src/main.tsx`: replace the `<AuthGate>…</AuthGate>` element with the following, and swap the `AuthGate` import for `AppRoutes` from `./app/AppRoutes.tsx`:
```tsx
          <AppRoutes
            app={
              <UserDataProviders client={supabase}>
                <App />
              </UserDataProviders>
            }
          />
```

`src/app/App.tsx`: add `import { LegalFooter } from '../features/legal/LegalFooter.tsx';` and render `<LegalFooter />` after `</Routes>`, inside `<main>`.

`src/features/auth/LoginPage.tsx`:
- Replace `{CONSENT_LABEL}` with the snippet below. Links open in a new tab, so the half-filled form is kept.
```tsx
                <span>
                  קראתי ואני מסכים/ה ל
                  <a href="/terms" target="_blank" rel="noopener">
                    תקנון
                  </a>{' '}
                  ול
                  <a href="/privacy" target="_blank" rel="noopener">
                    מדיניות הפרטיות
                  </a>
                  , ואני בן/בת 18 ומעלה
                </span>
```
- Remove `CONSENT_LABEL` from the import and from `messages.ts` (verify with `grep -r CONSENT_LABEL src` that nothing else uses it).
- Render the brand above the card and the footer below it, by wrapping the existing `<div className="auth-page">…</div>` like this:
```tsx
    <>
      <div className="auth-page">
        <p className="legal__brand">{BRAND}</p>
        {/* existing <Card> … </Card> unchanged */}
      </div>
      <LegalFooter />
    </>
```
  with `import { BRAND } from '../legal/contact.ts';` and `import { LegalFooter } from '../legal/LegalFooter.tsx';`.

Brand rename:
- `src/i18n/he.ts`: `appTitle: 'כל שעה',`.
- `index.html`: `<title>כל שעה — כל שעה נחשבת</title>`.
- `src/auth/SupabaseAuthService.ts`: `friendlyName: 'כל שעה',`. The name shown in the authenticator app applies to new enrollments only, so existing factors keep working.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/legal src/app src/features/auth src/auth`
Expected: PASS.

- [ ] **Step 6: Full checks, local smoke and commit**

Run: `npx tsc -b`, `npm run lint`, `npm test`. Expected: all green.

Then run `npm run build && npm run preview`, sign out, and open each of `http://localhost:4173/privacy`, `/terms` and `/accessibility`. Expected:
- Each page renders.
- The footer links work.
- There are 0 CSP errors in the console.
- The brand link leads to the login screen, which shows "כל שעה" and the footer.
- The tab title is "כל שעה — כל שעה נחשבת".
```bash
npx prettier --write src/features/legal src/app/AppRoutes.tsx src/app/AppRoutes.test.tsx src/main.tsx src/app/App.tsx src/features/auth/LoginPage.tsx src/features/auth/messages.ts src/features/auth/AuthGate.test.tsx src/i18n/he.ts index.html src/auth/SupabaseAuthService.ts src/auth/SupabaseAuthService.test.ts
git add src/features/legal src/app/AppRoutes.tsx src/app/AppRoutes.test.tsx src/main.tsx src/app/App.tsx src/features/auth/LoginPage.tsx src/features/auth/messages.ts src/features/auth/AuthGate.test.tsx src/i18n/he.ts index.html src/auth/SupabaseAuthService.ts src/auth/SupabaseAuthService.test.ts
git commit -m "feat(legal): privacy, terms and accessibility pages, legal footer, consent with terms + 18+, brand 'כל שעה'"
```
(`src/features/legal/` contains only new files, so formatting the directory is safe.)

---

### Task 5: Secret key, deploy and end-to-end check

**Files:** none (configuration + verification). Results are recorded in the ledger.

**Interfaces:**
- Consumes: everything above.
- Produces: Friday's deliverable, live and verified.

- [ ] **Step 1: Secret key (user).** Walk the user through it in Hebrew:
  1. In **Supabase → Project Settings → API Keys → Secret keys**, create a key named `vercel-api`.
  2. In **Vercel → hours-tracker → Settings → Environment Variables**, add `SUPABASE_SECRET_KEY` with that key as the value, type *Sensitive*, environments Production + Preview.

  It must never be pasted into the chat.

- [ ] **Step 2: Push (ask first) and check the deployment.** Ask the user before `git push`. After the deploy is Ready (Vercel MCP `list_deployments` / `get_deployment`), run, if the user's network allows it, `curl -s -o /dev/null -w "%{http_code}" -X POST https://hours-tracker-seven-liart.vercel.app/api/delete-account`.
  - Expected: `401` (the function runs and refuses requests without a token).
  - A `500` or `404` means the function did not build or load. Check Vercel runtime logs (MCP `get_runtime_logs`) before changing anything.

- [ ] **Step 3: End-to-end in production (user, with guidance)**
1. Signed out, open `/privacy`, `/terms` and `/accessibility`. Each shows the owner name and contact, and the footer links between them. The tab title is "כל שעה — כל שעה נחשבת". There are no console CSP errors.
2. Sign-up screen: the consent shows "18 ומעלה", and its "תקנון" and "מדיניות הפרטיות" links each open in a new tab.
3. Create a throwaway account (`+deltest` Gmail alias) and add one entry. Then go to Settings → מחיקת חשבון and type the email. Expected: the login screen appears, and signing in with that account fails.
4. Run MCP `execute_sql` (read-only) with the deleted user's id from step 3. Take the id before deleting, from `select id from auth.users where email = …`.
   ```sql
   select
     (select count(*) from auth.users where id = '<id>') as users,
     (select count(*) from public.time_entries where user_id = '<id>') as entries,
     (select count(*) from public.profiles where user_id = '<id>') as profiles,
     (select count(*) from public.audit_log where user_id = '<id>' and action = 'delete') as audit_deletes;
   ```
   Expected: `users = 0, entries = 0, profiles = 0, audit_deletes ≥ 2`.

Record the results in the ledger. Friday's plan is done when all four pass. Then write the rights-checker plan and start it, following spec §11.

---

