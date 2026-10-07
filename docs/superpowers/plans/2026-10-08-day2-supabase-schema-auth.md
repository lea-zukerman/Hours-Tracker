# Day 2 — Supabase Schema, RLS, Audit Log, Auth + 2FA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Supabase project (EU) with the cloud schema locked down by RLS, MFA-aware restrictive policies and an audit trail, plus a login gate in the app: email + password sign-up with privacy consent, sign-in, optional TOTP 2FA, sign-out.

**Architecture:** Schema lives in versioned SQL migrations under `supabase/migrations/`, applied to the remote project through the Supabase MCP (`apply_migration`). Security behaviour is proven by SQL test scripts under `supabase/tests/` that impersonate users (`set local role authenticated` + JWT claims) inside a rolled-back transaction, run via MCP `execute_sql`. In the app, a narrow `AuthService` interface (like the existing `Repository` seam) hides `supabase.auth`; `SupabaseAuthService` implements it, `FakeAuthService` drives component tests. An `AuthProvider` + `AuthGate` wrap the existing app; data still flows through `LocalStorageRepository` until Day 3 (TASKS T15).

**Tech Stack:** Supabase (Postgres 15+, Auth, MFA TOTP), `@supabase/supabase-js` v2, React 19, Vitest + Testing Library, Supabase MCP.

**Spec:** [docs/superpowers/specs/2026-10-07-submission-design.md](../specs/2026-10-07-submission-design.md) — §2, §3.2 (Identification & access, Data isolation, Encryption, Audit log, Data-subject rights: consent), §4, §7, §8 Day 2. Also [DESIGN.md §9.1–9.2](../../DESIGN.md), [TASKS.md T13–T14](../../TASKS.md).

## Global Constraints

- Supabase organization: `l-zukerman's Org` (id `vttkkphuhglbfqsichyo`). Region: **`eu-central-1` (Frankfurt)**. Project name: `hours-tracker`.
- RLS on **every** table in `public`; policies `to authenticated` using `(select auth.uid()) = user_id`; `anon` has no table privileges.
- MFA is **optional for the user, enforced by the database once enrolled** (Supabase "enforce only for users that have opted-in" pattern, `as restrictive`).
- `profiles.plan` and `profiles.stripe_customer_id` are never writable by users (column-level grants).
- Sign-up requires explicit privacy consent; enforced in the UI **and** by the `auth.users` insert trigger.
- Password policy (UI + Supabase dashboard): **min 10 chars, lowercase, uppercase, digit, symbol**.
- Browser holds only the **publishable** key (`VITE_SUPABASE_PUBLISHABLE_KEY`) — never the secret/service-role key. `.env.local` is git-ignored.
- Hebrew UI copy inline in feature files (codebase convention); email/password/code inputs are `dir="ltr"`.
- Every push to `main` deploys to production — ask the user before each push.

### Spec deviations (decided here; argued from the spec's intent)
1. **Login auditing** uses Supabase Auth's built-in audit log (`auth.audit_log_entries`, Dashboard → Authentication → Audit Logs) instead of a trigger on `auth.sessions` — server-side, not user-writable, no dependency on triggers in the managed `auth` schema. Our `audit_log` covers data changes.
2. **`audit_log.user_id` has no foreign key** (spec: `references auth.users on delete set null`). Israel's Data Security Regulations require keeping access logs ≥ 24 months; rows must survive account deletion, and a cascading delete that itself writes audit rows would collide with an FK. The column holds a pseudonymous UUID only.
3. **`payments` table** is created on Day 6 with the Stripe work; `profiles` additionally holds `name`, `locale`, `timezone` so Day 3's `Repository.getUser()` needs no further migration.

## Review Focus

1. **Session ends while the app is open** (token expiry, sign-out in another tab) → the login screen must replace the app, not a broken page. Pinned: Task 5 test "returns to login when the session ends".
2. **User closes the tab between password and 2FA code** → on return they must get the code screen, not the app. Pinned: Task 5 test "asks for the 2FA code when the session is only aal1".
3. **Double-submit on slow networks** → submit buttons disabled while a request is pending. Pinned: Task 5 test "disables submit while signing in".
4. **Email confirmation link opens the wrong site** (Site URL left at `localhost:3000`) → link must land on production. Pinned: Task 7 Step 2 dashboard setting + Step 6 manual E2E.
5. **Supabase default SMTP only delivers to organization members** → other people cannot finish sign-up until custom SMTP (Gmail) is configured. Pinned: Task 7 Step 3; README states the limitation if Gmail is not ready yet.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261008000100_core_schema.sql` | profiles, settings, time_entries, absences; grants; RLS; MFA restrictive policies; consent trigger |
| `supabase/migrations/20261008000200_audit_log.sql` | audit_log table, RLS, audit triggers |
| `supabase/tests/rls_isolation.sql` | Proves cross-user isolation, anon lockout, plan immutability, MFA enforcement, consent enforcement |
| `supabase/tests/audit_log.sql` | Proves audit rows are written, private, immutable, and survive account deletion |
| `supabase/README.md` | How migrations/tests are applied via MCP |
| `src/auth/AuthService.ts` | Auth interface + result/error types |
| `src/auth/mapAuthError.ts` (+test) | Supabase error → `AuthErrorCode` |
| `src/auth/passwordPolicy.ts` (+test) | Client mirror of the dashboard password policy |
| `src/auth/SupabaseAuthService.ts` (+test) | `AuthService` over `supabase.auth` |
| `src/auth/AuthContext.tsx` | `AuthProvider`, `useAuth`, auth state machine |
| `src/auth/README.md` | Folder purpose |
| `src/data/supabaseClient.ts` | Single `createClient` from Vite env (null when unconfigured) |
| `src/test/fakeAuth.ts` | `FakeAuthService` for component tests |
| `src/features/auth/messages.ts` | Hebrew auth copy |
| `src/features/auth/LoginPage.tsx` | Sign-in / sign-up (+consent) |
| `src/features/auth/MfaChallenge.tsx` | 2FA code step at login |
| `src/features/auth/AuthGate.tsx` (+test) | Chooses loading / login / 2FA / app |
| `src/features/auth/AccountMenu.tsx` | Header email + sign-out |
| `src/features/auth/auth.css` | Auth page layout |
| `src/features/settings/MfaCard.tsx` (+test) | Enable / disable 2FA |
| Modify `src/main.tsx`, `src/app/App.tsx`, `src/vite-env.d.ts`, `.mcp.json`, `README.md`, `package.json` | Wiring, env typing, MCP scoping, docs, dependency |
| Create `.env.example` | Documents the two public env vars |

---

### Task 1: Supabase project, client and configuration

**Files:**
- Create: `src/data/supabaseClient.ts`, `.env.example`, `.env.local` (git-ignored, not committed)
- Modify: `src/vite-env.d.ts`, `.mcp.json`, `package.json` / `package-lock.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const supabase: SupabaseClient | null` from `src/data/supabaseClient.ts`; project ref `<REF>` (recorded in the ledger) used by Tasks 2, 3, 7.

- [ ] **Step 1: Create the project via Supabase MCP**

Call `create_project` with `name: "hours-tracker"`, `region: "eu-central-1"`, `organization_id: "vttkkphuhglbfqsichyo"`. Then poll `get_project` until `status` is `ACTIVE_HEALTHY`.
Expected: project ref `<REF>` (20 lowercase chars). Write it to the ledger.

- [ ] **Step 2: Fetch the public connection values**

Call `get_project_url` and `get_publishable_keys` for `<REF>`.
Expected: URL `https://<REF>.supabase.co` and a key starting `sb_publishable_`. **Do not** fetch or print any secret/service-role key.

- [ ] **Step 3: Write env files**

`.env.example` (committed):

```
# Public values only — the publishable key is safe in the browser (RLS protects data).
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

`.env.local` (NOT committed; covered by `.gitignore` `.env.*` / `*.local`): the same two keys with the real values from Step 2.

Run: `git check-ignore -v .env.local` → Expected: a matching ignore rule is printed.

- [ ] **Step 4: Type the env vars** — replace `src/vite-env.d.ts` with:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 5: Install the client and create `src/data/supabaseClient.ts`**

Run: `npm install @supabase/supabase-js@^2`

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The single Supabase client (DESIGN.md §9). Uses only the publishable key —
 * every table is protected by RLS, so this key grants nothing on its own.
 * `null` when the env vars are missing (unit tests, misconfigured deploy);
 * main.tsx renders a configuration error instead of a blank page.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey) : null;
```

- [ ] **Step 6: Scope the Supabase MCP to this project**

In `.mcp.json` change the supabase `url` to `https://mcp.supabase.com/mcp?project_ref=<REF>` (deferred minor from Day 1). The user must re-open the Claude Code panel for it to take effect; it does not block the remaining tasks in this session.

- [ ] **Step 7: Verify build and commit**

Run: `npm run build` → Expected: succeeds.
Run: `npm test` → Expected: all existing tests pass.

```bash
git add .env.example src/vite-env.d.ts src/data/supabaseClient.ts .mcp.json package.json package-lock.json
git commit -m "feat(supabase): project config, typed env, publishable-key client"
```

---

### Task 2: Core schema with RLS, MFA enforcement and consent trigger

**Files:**
- Create: `supabase/tests/rls_isolation.sql`, `supabase/migrations/20261008000100_core_schema.sql`, `supabase/README.md`

**Interfaces:**
- Consumes: project `<REF>` (Task 1).
- Produces: tables `public.profiles(user_id, name, locale, timezone, plan, consent_at, email_reports, stripe_customer_id, created_at)`, `public.settings(user_id, …, updated_at)`, `public.time_entries(id, user_id, date, shifts, break_minutes, manual_minutes, note, updated_at)`, `public.absences(id, user_id, date_from, date_to, type, partial_minutes, note, updated_at)`; function `private.required_aal() returns text[]`. Sign-up metadata key **`privacy_consent`** (boolean `true`) — Task 4 sends it.

- [ ] **Step 1: Write the failing SQL test** — `supabase/tests/rls_isolation.sql`

```sql
-- RLS isolation test. Run with Supabase MCP execute_sql; everything rolls back.
-- Success: one row "rls_isolation: all checks passed". Failure: an exception naming the check.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}');

-- 1. The consent trigger created a profile for each user.
do $$ begin
  if (select count(*) from public.profiles
      where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')
        and consent_at is not null) <> 2 then
    raise exception 'FAIL 1: profiles not created with consent_at';
  end if;
end $$;

-- 2. User A writes their own rows.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "aal": "aal1"}';
insert into public.time_entries (user_id, date, shifts, break_minutes)
  values ('00000000-0000-0000-0000-00000000000a', '2026-10-01', '[]', 0);
insert into public.absences (user_id, date_from, date_to, type)
  values ('00000000-0000-0000-0000-00000000000a', '2026-10-05', '2026-10-05', 'vacation');

-- 3. User B sees none of A's rows and cannot touch them.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  if (select count(*) from public.time_entries) <> 0 then raise exception 'FAIL 3a: B sees A time_entries'; end if;
  if (select count(*) from public.absences) <> 0 then raise exception 'FAIL 3b: B sees A absences'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL 3c: B sees other profiles'; end if;
  update public.time_entries set note = 'hacked';
  delete from public.absences;
end $$;
do $$ begin
  begin
    insert into public.time_entries (user_id, date, shifts, break_minutes)
      values ('00000000-0000-0000-0000-00000000000a', '2026-10-02', '[]', 0);
    raise exception 'FAIL 3d: B inserted a row owned by A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. B cannot upgrade their own plan or set a Stripe id (column privileges).
do $$ begin
  begin
    update public.profiles set plan = 'pro';
    raise exception 'FAIL 4a: user changed plan';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set stripe_customer_id = 'cus_x';
    raise exception 'FAIL 4b: user changed stripe_customer_id';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set name = 'B', email_reports = false; -- allowed columns
end $$;

-- 5. A's rows survived B's update/delete attempts.
reset role;
do $$ begin
  if (select count(*) from public.time_entries where note = 'hacked') <> 0 then raise exception 'FAIL 5a: B modified A rows'; end if;
  if (select count(*) from public.absences where user_id = '00000000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'FAIL 5b: B deleted A rows';
  end if;
end $$;

-- 6. anon has no access at all.
set local role anon;
do $$ begin
  begin
    perform 1 from public.time_entries;
    raise exception 'FAIL 6: anon can read time_entries';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 7. Once A enrolls a verified TOTP factor, aal1 sessions see nothing; aal2 sees data.
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'test', 'totp', 'verified', now(), now());
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  if (select count(*) from public.time_entries) <> 0 then raise exception 'FAIL 7a: aal1 bypassed enrolled MFA'; end if;
end $$;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "aal": "aal2"}';
do $$ begin
  if (select count(*) from public.time_entries) <> 1 then raise exception 'FAIL 7b: aal2 cannot read own data'; end if;
end $$;

-- 8. Sign-up without privacy consent is rejected by the trigger.
reset role;
do $$ begin
  begin
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
      values ('00000000-0000-0000-0000-00000000000c', 'c@test.local', 'authenticated', 'authenticated', '{}');
    raise exception 'FAIL 8: user created without consent';
  exception when check_violation then null;
  end;
end $$;

select 'rls_isolation: all checks passed' as result;
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run the file's contents with MCP `execute_sql` (project `<REF>`).
Expected: error `relation "public.profiles" does not exist` (FAIL 1 path — schema missing).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261008000100_core_schema.sql`

```sql
-- Core schema (DESIGN.md §9.2; spec §3.2, §4). RLS on every table; MFA enforced once enrolled.

create schema if not exists private; -- not exposed through the Data API

-- ---------- profiles ----------
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  locale text not null default 'he-IL',
  timezone text not null default 'Asia/Jerusalem',
  plan text not null default 'free' check (plan in ('free', 'pro')),
  consent_at timestamptz not null,
  email_reports boolean not null default true,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- ---------- settings ----------
create table public.settings (
  user_id uuid primary key references auth.users on delete cascade,
  monthly_quota_minutes int not null check (monthly_quota_minutes >= 0),
  daily_target_minutes int not null check (daily_target_minutes >= 0),
  job_percent int not null check (job_percent between 1 and 100),
  work_days int[] not null,
  auto_break_enabled boolean not null,
  auto_break_threshold_minutes int not null check (auto_break_threshold_minutes >= 0),
  auto_break_deduct_minutes int not null check (auto_break_deduct_minutes >= 0),
  hours_format text not null check (hours_format in ('hm', 'decimal')),
  alert_lead_days int not null check (alert_lead_days >= 0),
  alerts_enabled jsonb not null,
  vacation_accrual_per_month numeric not null,
  sick_accrual_per_month numeric not null,
  vacation_opening_balance numeric not null,
  sick_opening_balance numeric not null,
  updated_at timestamptz not null default now()
);

-- ---------- time_entries ----------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  shifts jsonb not null,
  break_minutes int not null default 0 check (break_minutes >= 0),
  manual_minutes int check (manual_minutes >= 0),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index time_entries_user_date on public.time_entries (user_id, date);

-- ---------- absences ----------
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date_from date not null,
  date_to date not null,
  type text not null check (type in ('vacation', 'sick', 'holiday', 'reserve', 'unpaid')),
  partial_minutes int check (partial_minutes > 0),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  check (date_to >= date_from)
);
create index absences_user_from on public.absences (user_id, date_from);

-- ---------- privileges: nothing for anon; users get only what policies allow ----------
revoke all on public.profiles, public.settings, public.time_entries, public.absences from anon, authenticated;
grant select, insert, update, delete on public.settings, public.time_entries, public.absences to authenticated;
grant select on public.profiles to authenticated;
grant update (name, locale, timezone, email_reports) on public.profiles to authenticated;

-- ---------- MFA: aal2 required once the user has a verified factor ----------
create function private.required_aal()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    ) then array['aal2']
    else array['aal1', 'aal2']
  end;
$$;
grant usage on schema private to authenticated;
grant execute on function private.required_aal() to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.time_entries enable row level security;
alter table public.absences enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own profile: update" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own rows" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.time_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.absences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "mfa when enrolled" on public.profiles as restrictive for all to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (select private.required_aal()));
create policy "mfa when enrolled" on public.settings as restrictive for all to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (select private.required_aal()));
create policy "mfa when enrolled" on public.time_entries as restrictive for all to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (select private.required_aal()));
create policy "mfa when enrolled" on public.absences as restrictive for all to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (select private.required_aal()));

-- ---------- sign-up: consent required, profile created ----------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'privacy_consent', '') <> 'true' then
    raise exception 'privacy consent is required' using errcode = 'check_violation';
  end if;
  insert into public.profiles (user_id, consent_at) values (new.id, now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
```

- [ ] **Step 4: Apply the migration**

MCP `apply_migration` with `name: "core_schema"` and the file's SQL.
Expected: success.

- [ ] **Step 5: Run the test to verify it passes**

MCP `execute_sql` with `supabase/tests/rls_isolation.sql`.
Expected: one row `rls_isolation: all checks passed`.

- [ ] **Step 6: Security advisors**

MCP `get_advisors` with `type: "security"`.
Expected: no `rls_disabled_in_public`, no `policy_exists_rls_disabled`, no `function_search_path_mutable` for our functions. Other advisor notices (e.g. leaked-password protection — Pro plan only) are recorded in the ledger, not fixed.

- [ ] **Step 7: Document and commit** — `supabase/README.md`:

```markdown
# Supabase

Project: `hours-tracker`, region `eu-central-1` (Frankfurt).

- `migrations/` — schema, applied in filename order with the Supabase MCP `apply_migration` tool (name = the part after the timestamp).
- `tests/` — security tests. Run each file with the Supabase MCP `execute_sql` tool; every test wraps itself in `begin … rollback` and ends with a single `… all checks passed` row, or raises `FAIL n: …`.

Never put the service-role/secret key in the browser or in this repo.
```

```bash
git add supabase/
git commit -m "feat(db): core schema with RLS, MFA-when-enrolled policies and consent trigger"
```

---

### Task 3: Audit log

**Files:**
- Create: `supabase/tests/audit_log.sql`, `supabase/migrations/20261008000200_audit_log.sql`

**Interfaces:**
- Consumes: tables and `private.required_aal()` from Task 2.
- Produces: `public.audit_log(id, user_id, action, table_name, row_id, at)`, readable by its owner only; Day 4 (privacy/account deletion) relies on rows surviving user deletion.

- [ ] **Step 1: Write the failing SQL test** — `supabase/tests/audit_log.sql`

```sql
-- Audit log test. Run with Supabase MCP execute_sql; everything rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "aal": "aal1"}';
insert into public.time_entries (id, user_id, date, shifts, break_minutes)
  values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', '2026-10-01', '[]', 0);
update public.time_entries set note = 'edited' where id = '11111111-1111-1111-1111-111111111111';
delete from public.time_entries where id = '11111111-1111-1111-1111-111111111111';

-- 1. Insert, update and delete were each recorded for A, with the row id.
do $$ begin
  if (select array_agg(action order by id) from public.audit_log where table_name = 'time_entries')
     <> array['insert', 'update', 'delete'] then
    raise exception 'FAIL 1: expected insert/update/delete audit rows';
  end if;
  if exists (select 1 from public.audit_log where row_id <> '11111111-1111-1111-1111-111111111111' and table_name = 'time_entries') then
    raise exception 'FAIL 1b: wrong row_id';
  end if;
end $$;

-- 2. A cannot write, change or erase audit rows.
do $$ begin
  begin
    insert into public.audit_log (user_id, action, table_name) values ('00000000-0000-0000-0000-0000000000a1', 'insert', 'x');
    raise exception 'FAIL 2a: user inserted audit row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.audit_log;
    raise exception 'FAIL 2b: user deleted audit rows';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.audit_log set action = 'insert';
    raise exception 'FAIL 2c: user edited audit rows';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. B cannot see A's audit rows.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  if (select count(*) from public.audit_log) <> 0 then raise exception 'FAIL 3: B sees A audit rows'; end if;
end $$;

-- 4. Deleting A's account cascades their data and keeps the audit trail.
reset role;
insert into public.absences (user_id, date_from, date_to, type)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-05', '2026-10-05', 'sick');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  if exists (select 1 from public.absences where user_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL 4a: user data not deleted';
  end if;
  if (select count(*) from public.audit_log where user_id = '00000000-0000-0000-0000-0000000000a1') < 4 then
    raise exception 'FAIL 4b: audit trail lost on account deletion';
  end if;
end $$;

select 'audit_log: all checks passed' as result;
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

MCP `execute_sql` with the file. Expected: error `relation "public.audit_log" does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261008000200_audit_log.sql`

```sql
-- Audit trail of data changes (spec §3.2). Logins are audited by Supabase Auth
-- itself (auth.audit_log_entries). user_id has no FK on purpose: Israel's Data
-- Security Regulations require keeping access logs >= 24 months, so rows outlive
-- the account; they hold a pseudonymous id only.

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  row_id text,
  at timestamptz not null default now()
);
create index audit_log_user_at on public.audit_log (user_id, at desc);

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

alter table public.audit_log enable row level security;
create policy "own audit rows: read" on public.audit_log for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "mfa when enrolled" on public.audit_log as restrictive for all to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (select private.required_aal()));

create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (user_id, action, table_name, row_id)
  values (
    coalesce((select auth.uid()), (r ->> 'user_id')::uuid),
    lower(tg_op),
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'user_id')
  );
  return null;
end;
$$;

create trigger audit after insert or update or delete on public.profiles
  for each row execute function private.audit_row();
create trigger audit after insert or update or delete on public.settings
  for each row execute function private.audit_row();
create trigger audit after insert or update or delete on public.time_entries
  for each row execute function private.audit_row();
create trigger audit after insert or update or delete on public.absences
  for each row execute function private.audit_row();
```

- [ ] **Step 4: Apply** — MCP `apply_migration` `name: "audit_log"`. Expected: success.

- [ ] **Step 5: Run both SQL tests** — `audit_log.sql` → `audit_log: all checks passed`; `rls_isolation.sql` → `rls_isolation: all checks passed` (regression).

- [ ] **Step 6: Advisors** — `get_advisors` security → no new RLS/search-path findings.

- [ ] **Step 7: Commit**

```bash
git add supabase/
git commit -m "feat(db): immutable per-user audit log of data changes"
```

---

### Task 4: AuthService and its Supabase implementation

**Files:**
- Create: `src/auth/AuthService.ts`, `src/auth/mapAuthError.ts`, `src/auth/mapAuthError.test.ts`, `src/auth/passwordPolicy.ts`, `src/auth/passwordPolicy.test.ts`, `src/auth/SupabaseAuthService.ts`, `src/auth/SupabaseAuthService.test.ts`, `src/auth/README.md`

**Interfaces:**
- Consumes: sign-up metadata key `privacy_consent` (Task 2 trigger).
- Produces (exact):

```ts
export interface AuthSession { userId: string; email: string }
export type AssuranceLevel = 'aal1' | 'aal2';
export type AuthErrorCode = 'invalid_credentials' | 'email_not_confirmed' | 'weak_password' | 'invalid_code' | 'rate_limited' | 'network' | 'unknown';
export type AuthResult<T = null> = { ok: true; value: T } | { ok: false; error: AuthErrorCode };
export interface MfaEnrollment { factorId: string; qrCodeSvg: string; secret: string }
export interface SignUpInput { email: string; password: string; privacyConsent: true }
export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult<{ needsEmailConfirmation: boolean }>>;
  signOut(): Promise<void>;
  getAssurance(): Promise<{ current: AssuranceLevel; next: AssuranceLevel }>;
  verifyMfa(code: string): Promise<AuthResult>;
  hasMfa(): Promise<boolean>;
  startMfaEnrollment(): Promise<AuthResult<MfaEnrollment>>;
  confirmMfaEnrollment(factorId: string, code: string): Promise<AuthResult>;
  disableMfa(): Promise<AuthResult>;
}
// mapAuthError.ts
export function mapAuthError(error: { code?: string; name?: string; status?: number } | null | undefined): AuthErrorCode;
// passwordPolicy.ts
export const MIN_PASSWORD_LENGTH = 10;
export function isStrongPassword(password: string): boolean;
// SupabaseAuthService.ts
export class SupabaseAuthService implements AuthService { constructor(auth: SupabaseClient['auth']) }
```

- [ ] **Step 1: Write `src/auth/AuthService.ts`** (types only — the block above, with this header comment):

```ts
/**
 * The authentication boundary (spec §3.2 "Identification & access"). Components
 * talk to this interface only — SupabaseAuthService implements it over
 * supabase.auth, FakeAuthService (src/test/fakeAuth.ts) drives UI tests — the
 * same seam pattern as data/Repository.ts.
 */
export interface AuthSession {
  userId: string;
  email: string;
}

export type AssuranceLevel = 'aal1' | 'aal2';

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'invalid_code'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export type AuthResult<T = null> = { ok: true; value: T } | { ok: false; error: AuthErrorCode };

export interface MfaEnrollment {
  factorId: string;
  qrCodeSvg: string; // data: URL, rendered as <img>
  secret: string; // for manual entry in the authenticator app
}

/** `privacyConsent: true` is a type-level guarantee the UI collected consent. */
export interface SignUpInput {
  email: string;
  password: string;
  privacyConsent: true;
}

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  /** Returns an unsubscribe function. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult<{ needsEmailConfirmation: boolean }>>;
  signOut(): Promise<void>;
  /** current: what this session proved; next: what the account requires. */
  getAssurance(): Promise<{ current: AssuranceLevel; next: AssuranceLevel }>;
  verifyMfa(code: string): Promise<AuthResult>;
  hasMfa(): Promise<boolean>;
  startMfaEnrollment(): Promise<AuthResult<MfaEnrollment>>;
  confirmMfaEnrollment(factorId: string, code: string): Promise<AuthResult>;
  disableMfa(): Promise<AuthResult>;
}
```

- [ ] **Step 2: Write failing tests for the pure helpers**

`src/auth/mapAuthError.test.ts`:

```ts
import { mapAuthError } from './mapAuthError.ts';

describe('mapAuthError', () => {
  it.each([
    ['invalid_credentials', 'invalid_credentials'],
    ['email_not_confirmed', 'email_not_confirmed'],
    ['weak_password', 'weak_password'],
    ['mfa_verification_failed', 'invalid_code'],
    ['mfa_challenge_expired', 'invalid_code'],
    ['over_request_rate_limit', 'rate_limited'],
    ['over_email_send_rate_limit', 'rate_limited'],
  ] as const)('maps Supabase code %s → %s', (code, expected) => {
    expect(mapAuthError({ code, status: 400, name: 'AuthApiError' })).toBe(expected);
  });

  it('treats fetch failures as network errors', () => {
    expect(mapAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
  });

  it('falls back to unknown for anything else, including no error object', () => {
    expect(mapAuthError({ code: 'unexpected_failure', status: 500 })).toBe('unknown');
    expect(mapAuthError(null)).toBe('unknown');
    expect(mapAuthError(undefined)).toBe('unknown');
  });
});
```

`src/auth/passwordPolicy.test.ts`:

```ts
import { isStrongPassword, MIN_PASSWORD_LENGTH } from './passwordPolicy.ts';

describe('isStrongPassword (mirrors the Supabase dashboard policy)', () => {
  it('requires at least 10 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(isStrongPassword('Ab1!xyzw')).toBe(false); // 8 chars
    expect(isStrongPassword('Ab1!xyzwvu')).toBe(true); // 10 chars
  });

  it.each([
    ['no uppercase', 'ab1!xyzwvu'],
    ['no lowercase', 'AB1!XYZWVU'],
    ['no digit', 'Abc!xyzwvu'],
    ['no symbol', 'Ab1cxyzwvu'],
  ])('rejects a password with %s', (_label, pw) => {
    expect(isStrongPassword(pw)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/auth` → Expected: FAIL — cannot resolve `./mapAuthError.ts` / `./passwordPolicy.ts`.

- [ ] **Step 4: Implement the helpers**

`src/auth/mapAuthError.ts`:

```ts
import type { AuthErrorCode } from './AuthService.ts';

const BY_CODE: Record<string, AuthErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  weak_password: 'weak_password',
  mfa_verification_failed: 'invalid_code',
  mfa_challenge_expired: 'invalid_code',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
};

/** Supabase AuthError → our closed set of codes (UI maps them to Hebrew). */
export function mapAuthError(
  error: { code?: string; name?: string; status?: number } | null | undefined,
): AuthErrorCode {
  if (!error) return 'unknown';
  if (error.code && error.code in BY_CODE) return BY_CODE[error.code];
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  return 'unknown';
}
```

`src/auth/passwordPolicy.ts`:

```ts
/**
 * Client-side mirror of the Supabase Auth password policy (Dashboard →
 * Authentication → Providers → Email: min length 10, lowercase + uppercase +
 * digits + symbols). The server is the authority; this only gives instant feedback.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
```

Run: `npx vitest run src/auth` → Expected: PASS.

- [ ] **Step 5: Write the failing test for `SupabaseAuthService`** — `src/auth/SupabaseAuthService.test.ts`

```ts
import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthService } from './SupabaseAuthService.ts';

type AsyncMock = ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<unknown>>>;
const resolves = (value: unknown): AsyncMock =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => value);

function fakeAuth() {
  const unsubscribe = vi.fn();
  return {
    unsubscribe,
    getSession: resolves({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn<(...args: unknown[]) => unknown>(() => ({
      data: { subscription: { unsubscribe } },
    })),
    signInWithPassword: resolves({ data: {}, error: null }),
    signUp: resolves({ data: { session: null, user: { id: 'u1' } }, error: null }),
    signOut: resolves({ error: null }),
    refreshSession: resolves({ data: {}, error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: resolves({
        data: { currentLevel: 'aal1', nextLevel: 'aal1' },
        error: null,
      }),
      listFactors: resolves({ data: { all: [], totp: [] }, error: null }),
      enroll: resolves({
        data: { id: 'f-new', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET', uri: 'otpauth://x' } },
        error: null,
      }),
      challengeAndVerify: resolves({ data: {}, error: null }),
      unenroll: resolves({ data: {}, error: null }),
    },
  };
}

const serviceFor = (auth: ReturnType<typeof fakeAuth>) =>
  new SupabaseAuthService(auth as unknown as SupabaseClient['auth']);

describe('SupabaseAuthService', () => {
  it('signs up with the privacy-consent metadata the database trigger requires', async () => {
    const auth = fakeAuth();
    const result = await serviceFor(auth).signUp({
      email: 'a@b.co',
      password: 'Ab1!xyzwvu',
      privacyConsent: true,
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'Ab1!xyzwvu',
      options: { data: { privacy_consent: true }, emailRedirectTo: window.location.origin },
    });
    expect(result).toEqual({ ok: true, value: { needsEmailConfirmation: true } });
  });

  it('maps a failed sign-in to a closed error code', async () => {
    const auth = fakeAuth();
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { code: 'invalid_credentials', status: 400, name: 'AuthApiError' },
    });
    expect(await serviceFor(auth).signIn('a@b.co', 'wrong')).toEqual({
      ok: false,
      error: 'invalid_credentials',
    });
  });

  it('maps the session to { userId, email }', async () => {
    const auth = fakeAuth();
    auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1', email: 'a@b.co' } } },
      error: null,
    });
    expect(await serviceFor(auth).getSession()).toEqual({ userId: 'u1', email: 'a@b.co' });
  });

  it('defers session-change listeners out of the Supabase callback and can unsubscribe', async () => {
    const auth = fakeAuth();
    const listener = vi.fn();
    const stop = serviceFor(auth).onSessionChange(listener);
    const callback = auth.onAuthStateChange.mock.calls[0][0] as (e: string, s: unknown) => void;

    callback('SIGNED_IN', { user: { id: 'u1', email: 'a@b.co' } });
    expect(listener).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(listener).toHaveBeenCalledWith({ userId: 'u1', email: 'a@b.co' });

    stop();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

  it('reports a null current level as aal1', async () => {
    const auth = fakeAuth();
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: { currentLevel: null, nextLevel: 'aal2' },
      error: null,
    });
    expect(await serviceFor(auth).getAssurance()).toEqual({ current: 'aal1', next: 'aal2' });
  });

  it('verifies the login code against the first verified TOTP factor', async () => {
    const auth = fakeAuth();
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [{ id: 'f9' }] }, error: null });
    expect(await serviceFor(auth).verifyMfa('123456')).toEqual({ ok: true, value: null });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f9', code: '123456' });
  });

  it('fails verification without calling Supabase when no factor exists', async () => {
    const auth = fakeAuth();
    expect(await serviceFor(auth).verifyMfa('123456')).toEqual({ ok: false, error: 'unknown' });
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('clears abandoned unverified factors before enrolling a new one', async () => {
    const auth = fakeAuth();
    auth.mfa.listFactors.mockResolvedValueOnce({
      data: { all: [{ id: 'stale', status: 'unverified' }, { id: 'ok', status: 'verified' }], totp: [] },
      error: null,
    });
    const result = await serviceFor(auth).startMfaEnrollment();
    expect(auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale' });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Hours Tracker' });
    expect(result).toEqual({
      ok: true,
      value: { factorId: 'f-new', qrCodeSvg: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET' },
    });
  });

  it('disables 2FA by unenrolling the factor and refreshing the session', async () => {
    const auth = fakeAuth();
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [{ id: 'f9' }] }, error: null });
    expect(await serviceFor(auth).disableMfa()).toEqual({ ok: true, value: null });
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f9' });
    expect(auth.refreshSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/auth/SupabaseAuthService.test.ts` → Expected: FAIL — cannot resolve `./SupabaseAuthService.ts`.

- [ ] **Step 7: Implement `src/auth/SupabaseAuthService.ts`**

```ts
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type {
  AssuranceLevel,
  AuthResult,
  AuthService,
  AuthSession,
  MfaEnrollment,
  SignUpInput,
} from './AuthService.ts';
import { mapAuthError } from './mapAuthError.ts';

type SupabaseAuth = SupabaseClient['auth'];

const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });
const fail = (error: Parameters<typeof mapAuthError>[0]): AuthResult<never> => ({
  ok: false,
  error: mapAuthError(error),
});
const level = (l: string | null | undefined): AssuranceLevel => (l === 'aal2' ? 'aal2' : 'aal1');

function toSession(session: Session | null): AuthSession | null {
  return session ? { userId: session.user.id, email: session.user.email ?? '' } : null;
}

/** AuthService over Supabase Auth (email + password, TOTP MFA). */
export class SupabaseAuthService implements AuthService {
  private readonly auth: SupabaseAuth;

  constructor(auth: SupabaseAuth) {
    this.auth = auth;
  }

  async getSession(): Promise<AuthSession | null> {
    const { data } = await this.auth.getSession();
    return toSession(data.session);
  }

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    // Supabase warns that calling auth methods inside this callback can deadlock;
    // defer so listeners may call getSession()/getAssurance() freely.
    const { data } = this.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => listener(toSession(session)), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await this.auth.signInWithPassword({ email, password });
    return error ? fail(error) : ok(null);
  }

  async signUp({ email, password, privacyConsent }: SignUpInput) {
    const { data, error } = await this.auth.signUp({
      email,
      password,
      options: {
        data: { privacy_consent: privacyConsent }, // required by private.handle_new_user()
        emailRedirectTo: window.location.origin,
      },
    });
    return error ? fail(error) : ok({ needsEmailConfirmation: !data.session });
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  async getAssurance() {
    const { data } = await this.auth.mfa.getAuthenticatorAssuranceLevel();
    return { current: level(data?.currentLevel), next: level(data?.nextLevel) };
  }

  async verifyMfa(code: string): Promise<AuthResult> {
    const factorId = await this.verifiedFactorId();
    if (!factorId) return fail(null);
    const { error } = await this.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? fail(error) : ok(null);
  }

  async hasMfa(): Promise<boolean> {
    return (await this.verifiedFactorId()) !== null;
  }

  async startMfaEnrollment(): Promise<AuthResult<MfaEnrollment>> {
    // A previous enrollment abandoned before its code was confirmed would block
    // a new one with the same friendly name.
    const { data: factors } = await this.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.status === 'unverified') await this.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await this.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Hours Tracker',
    });
    if (error || !data) return fail(error);
    return ok({ factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret });
  }

  async confirmMfaEnrollment(factorId: string, code: string): Promise<AuthResult> {
    const { error } = await this.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? fail(error) : ok(null);
  }

  async disableMfa(): Promise<AuthResult> {
    const factorId = await this.verifiedFactorId();
    if (!factorId) return ok(null);
    const { error } = await this.auth.mfa.unenroll({ factorId });
    if (error) return fail(error);
    await this.auth.refreshSession(); // drop aal2 now, not at the next token refresh
    return ok(null);
  }

  private async verifiedFactorId(): Promise<string | null> {
    const { data } = await this.auth.mfa.listFactors();
    return data?.totp[0]?.id ?? null; // `totp` lists verified factors only
  }
}
```

`src/auth/README.md`:

```markdown
# auth/

Authentication boundary (spec §3.2). `AuthService.ts` is the interface the UI
uses; `SupabaseAuthService.ts` implements it over Supabase Auth; `AuthContext.tsx`
turns it into React state (`loading` / `signed_out` / `mfa_required` / `signed_in`).
Tests use `src/test/fakeAuth.ts`.
```

- [ ] **Step 8: Run to verify it passes, then type-check**

Run: `npx vitest run src/auth` → Expected: all pass.
Run: `npx tsc -b` → Expected: no errors. If the installed supabase-js types disagree with a call above (e.g. the enroll response union), narrow with the type the compiler names and ledger the ruling.

- [ ] **Step 9: Commit**

```bash
git add src/auth/
git commit -m "feat(auth): AuthService seam with Supabase implementation and password policy"
```

---

### Task 5: Login gate — AuthProvider, AuthGate, login, 2FA challenge, sign-out

**Files:**
- Create: `src/auth/AuthContext.tsx`, `src/test/fakeAuth.ts`, `src/features/auth/messages.ts`, `src/features/auth/LoginPage.tsx`, `src/features/auth/MfaChallenge.tsx`, `src/features/auth/AuthGate.tsx`, `src/features/auth/AccountMenu.tsx`, `src/features/auth/auth.css`, `src/features/auth/AuthGate.test.tsx`
- Modify: `src/main.tsx`, `src/app/App.tsx`

**Interfaces:**
- Consumes: `AuthService` and types (Task 4), `isStrongPassword` (Task 4), `supabase` (Task 1).
- Produces:

```ts
export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'mfa_required'; session: AuthSession }
  | { status: 'signed_in'; session: AuthSession };
export function AuthProvider(props: { service: AuthService; children: ReactNode }): JSX.Element;
export function useAuth(): { state: AuthState; service: AuthService; refresh(): Promise<void> };
export class FakeAuthService implements AuthService { /* see Step 1 */ }
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string>;
```

- [ ] **Step 1: Write the test double** — `src/test/fakeAuth.ts`

```ts
import type {
  AssuranceLevel,
  AuthResult,
  AuthService,
  AuthSession,
  MfaEnrollment,
  SignUpInput,
} from '../auth/AuthService.ts';

const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });

/** In-memory AuthService for component tests. The valid 2FA code is always 123456. */
export class FakeAuthService implements AuthService {
  static readonly VALID_CODE = '123456';
  readonly users = new Map<string, string>();
  session: AuthSession | null = null;
  mfaEnrolled: boolean;
  lastSignUp: SignUpInput | null = null;
  private mfaPassed = false;
  private pendingFactorId: string | null = null;
  private readonly listeners = new Set<(s: AuthSession | null) => void>();
  /** When set, signIn waits for this promise (to observe pending UI). */
  signInGate: Promise<void> | null = null;

  constructor(
    opts: {
      users?: Record<string, string>;
      signedInAs?: string;
      mfaEnrolled?: boolean;
      mfaPassed?: boolean;
    } = {},
  ) {
    for (const [email, pw] of Object.entries(opts.users ?? {})) this.users.set(email, pw);
    if (opts.signedInAs) this.session = { userId: `user-${opts.signedInAs}`, email: opts.signedInAs };
    this.mfaEnrolled = opts.mfaEnrolled ?? false;
    this.mfaPassed = opts.mfaPassed ?? false;
  }

  async getSession() {
    return this.session;
  }

  onSessionChange(listener: (s: AuthSession | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Simulates the session ending outside the app (expiry, sign-out in another tab). */
  expireSession() {
    this.session = null;
    this.mfaPassed = false;
    this.emit();
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    if (this.signInGate) await this.signInGate;
    if (this.users.get(email) !== password) return { ok: false, error: 'invalid_credentials' };
    this.session = { userId: `user-${email}`, email };
    this.mfaPassed = false;
    this.emit();
    return ok(null);
  }

  async signUp(input: SignUpInput) {
    this.lastSignUp = input;
    this.users.set(input.email, input.password);
    return ok({ needsEmailConfirmation: true });
  }

  async signOut() {
    this.expireSession();
  }

  async getAssurance(): Promise<{ current: AssuranceLevel; next: AssuranceLevel }> {
    return {
      current: this.mfaEnrolled && this.mfaPassed ? 'aal2' : 'aal1',
      next: this.mfaEnrolled ? 'aal2' : 'aal1',
    };
  }

  async verifyMfa(code: string): Promise<AuthResult> {
    if (!this.mfaEnrolled || code !== FakeAuthService.VALID_CODE) {
      return { ok: false, error: 'invalid_code' };
    }
    this.mfaPassed = true;
    return ok(null);
  }

  async hasMfa() {
    return this.mfaEnrolled;
  }

  async startMfaEnrollment(): Promise<AuthResult<MfaEnrollment>> {
    this.pendingFactorId = 'factor-1';
    return ok({
      factorId: 'factor-1',
      qrCodeSvg: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',
      secret: 'JBSWY3DPEHPK3PXP',
    });
  }

  async confirmMfaEnrollment(factorId: string, code: string): Promise<AuthResult> {
    if (factorId !== this.pendingFactorId || code !== FakeAuthService.VALID_CODE) {
      return { ok: false, error: 'invalid_code' };
    }
    this.mfaEnrolled = true;
    this.mfaPassed = true;
    return ok(null);
  }

  async disableMfa(): Promise<AuthResult> {
    this.mfaEnrolled = false;
    this.mfaPassed = false;
    return ok(null);
  }

  private emit() {
    for (const listener of this.listeners) listener(this.session);
  }
}
```

- [ ] **Step 2: Write the failing component test** — `src/features/auth/AuthGate.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../auth/AuthContext.tsx';
import { AuthGate } from './AuthGate.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import { FakeAuthService } from '../../test/fakeAuth.ts';

const PASSWORD = 'Ab1!xyzwvu';

function renderGate(service: FakeAuthService) {
  return render(
    <AuthProvider service={service}>
      <AuthGate>
        <AccountMenu />
        <p>תוכן האפליקציה</p>
      </AuthGate>
    </AuthProvider>,
  );
}

function fillCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: password } });
}

describe('AuthGate', () => {
  it('shows the login screen when signed out', async () => {
    renderGate(new FakeAuthService());
    expect(await screen.findByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
    expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument();
  });

  it('shows the app after a successful sign-in, with the email and a sign-out button', async () => {
    renderGate(new FakeAuthService({ users: { 'a@b.co': PASSWORD } }));
    await screen.findByRole('heading', { name: 'התחברות' });
    fillCredentials('a@b.co', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
    expect(screen.getByText('a@b.co')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'התנתקות' }));
    expect(await screen.findByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
  });

  it('shows a generic message for wrong credentials', async () => {
    renderGate(new FakeAuthService({ users: { 'a@b.co': PASSWORD } }));
    await screen.findByRole('heading', { name: 'התחברות' });
    fillCredentials('a@b.co', 'Wrong1!pass');
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('אימייל או סיסמה שגויים');
  });

  it('disables submit while signing in', async () => {
    const service = new FakeAuthService({ users: { 'a@b.co': PASSWORD } });
    let release!: () => void;
    service.signInGate = new Promise((r) => (release = r));
    renderGate(service);
    await screen.findByRole('heading', { name: 'התחברות' });
    fillCredentials('a@b.co', PASSWORD);
    const submit = screen.getByRole('button', { name: 'התחברות' });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    release();
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
  });

  it('requires consent and a strong password to sign up, and sends consent', async () => {
    const service = new FakeAuthService();
    renderGate(service);
    fireEvent.click(await screen.findByRole('button', { name: 'אין לך חשבון? להרשמה' }));
    const submit = screen.getByRole('button', { name: 'יצירת חשבון' });

    fillCredentials('new@b.co', PASSWORD);
    expect(submit).toBeDisabled(); // no consent yet
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).toBeEnabled();

    fillCredentials('new@b.co', 'short');
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('הסיסמה חלשה מדי');
    expect(service.lastSignUp).toBeNull();

    fillCredentials('new@b.co', PASSWORD);
    fireEvent.click(submit);
    expect(await screen.findByRole('status')).toHaveTextContent('נשלח אליך מייל');
    expect(service.lastSignUp).toEqual({ email: 'new@b.co', password: PASSWORD, privacyConsent: true });
  });

  it('asks for the 2FA code when the session is only aal1', async () => {
    renderGate(new FakeAuthService({ signedInAs: 'a@b.co', mfaEnrolled: true }));
    expect(await screen.findByRole('heading', { name: 'אימות דו-שלבי' })).toBeInTheDocument();
    expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('קוד מאפליקציית האימות'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'אימות' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הקוד שגוי');

    fireEvent.change(screen.getByLabelText('קוד מאפליקציית האימות'), {
      target: { value: FakeAuthService.VALID_CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'אימות' }));
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
  });

  it('returns to login when the session ends', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co' });
    renderGate(service);
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
    service.expireSession();
    await waitFor(() => expect(screen.queryByText('תוכן האפליקציה')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'התחברות' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/features/auth` → Expected: FAIL — cannot resolve `../../auth/AuthContext.tsx`.

- [ ] **Step 4: Implement `src/auth/AuthContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthService, AuthSession } from './AuthService.ts';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'mfa_required'; session: AuthSession }
  | { status: 'signed_in'; session: AuthSession };

interface AuthContextValue {
  state: AuthState;
  service: AuthService;
  /** Re-reads session + assurance level; call after any auth action. */
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth state machine (spec §3.2). A user with a verified 2FA factor whose
 * session is still aal1 is `mfa_required` — the database would refuse their
 * data anyway (restrictive RLS policies), so the UI asks for the code first.
 */
export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    const session = await service.getSession();
    if (!session) {
      setState({ status: 'signed_out' });
      return;
    }
    const { current, next } = await service.getAssurance();
    setState(
      next === 'aal2' && current !== 'aal2'
        ? { status: 'mfa_required', session }
        : { status: 'signed_in', session },
    );
  }, [service]);

  useEffect(() => {
    void refresh();
    return service.onSessionChange(() => void refresh());
  }, [service, refresh]);

  const value = useMemo(() => ({ state, service, refresh }), [state, service, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within an AuthProvider');
  return value;
}
```

- [ ] **Step 5: Implement the feature files**

`src/features/auth/messages.ts`:

```ts
import type { AuthErrorCode } from '../../auth/AuthService.ts';

export const PASSWORD_RULES = 'לפחות 10 תווים, כולל אות גדולה ואות קטנה באנגלית, ספרה וסימן';

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: 'אימייל או סיסמה שגויים',
  email_not_confirmed: 'יש לאשר את כתובת האימייל דרך הקישור שנשלח אליך',
  weak_password: `הסיסמה חלשה מדי: ${PASSWORD_RULES}`,
  invalid_code: 'הקוד שגוי או שפג תוקפו',
  rate_limited: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות',
  network: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט',
  unknown: 'משהו השתבש. נסו שוב',
};

export const CONSENT_LABEL =
  'אני מאשר/ת את מדיניות הפרטיות ואת שמירת נתוני שעות העבודה שלי בשרת מאובטח';

export const CONFIRM_EMAIL_NOTICE = 'נשלח אליך מייל לאישור הכתובת. אחרי האישור אפשר להתחבר.';
```

`src/features/auth/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useAuth } from '../../auth/AuthContext.tsx';
import { isStrongPassword } from '../../auth/passwordPolicy.ts';
import {
  AUTH_ERROR_MESSAGES,
  CONFIRM_EMAIL_NOTICE,
  CONSENT_LABEL,
  PASSWORD_RULES,
} from './messages.ts';

type Mode = 'signin' | 'signup';

/** Sign-in and sign-up (spec §3.2: verified email, password policy, explicit consent). */
export function LoginPage() {
  const { service, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'signup' && !isStrongPassword(password)) {
      setError(AUTH_ERROR_MESSAGES.weak_password);
      return;
    }
    setPending(true);
    try {
      if (mode === 'signin') {
        const result = await service.signIn(email.trim(), password);
        if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
        else await refresh();
      } else if (consent) {
        const result = await service.signUp({ email: email.trim(), password, privacyConsent: true });
        if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
        else if (result.value.needsEmailConfirmation) setNotice(CONFIRM_EMAIL_NOTICE);
        else await refresh();
      }
    } finally {
      setPending(false);
    }
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setNotice(null);
  }

  const isSignup = mode === 'signup';
  return (
    <div className="auth-page">
      <Card title={isSignup ? 'הרשמה' : 'התחברות'} className="auth-card">
        <form className="te-form" onSubmit={onSubmit}>
          <label className="te-field">
            אימייל
            <input
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="te-field">
            סיסמה
            <input
              type="password"
              dir="ltr"
              required
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {isSignup && (
            <>
              <p className="auth-hint">{PASSWORD_RULES}</p>
              <label className="te-checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {CONSENT_LABEL}
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="auth-notice">
              {notice}
            </p>
          )}
          <Button type="submit" disabled={pending || (isSignup && !consent)}>
            {isSignup ? 'יצירת חשבון' : 'התחברות'}
          </Button>
        </form>
        <Button variant="ghost" onClick={switchMode}>
          {isSignup ? 'כבר יש לך חשבון? להתחברות' : 'אין לך חשבון? להרשמה'}
        </Button>
      </Card>
    </div>
  );
}
```

`src/features/auth/MfaChallenge.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useAuth } from '../../auth/AuthContext.tsx';
import { AUTH_ERROR_MESSAGES } from './messages.ts';

/** Second login step for users with 2FA enabled (session aal1 → aal2). */
export function MfaChallenge() {
  const { service, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await service.verifyMfa(code.trim());
      if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
      else await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <Card title="אימות דו-שלבי" className="auth-card">
        <form className="te-form" onSubmit={onSubmit}>
          <label className="te-field">
            קוד מאפליקציית האימות
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            אימות
          </Button>
        </form>
        <Button variant="ghost" onClick={() => void service.signOut()}>
          התנתקות
        </Button>
      </Card>
    </div>
  );
}
```

`src/features/auth/AuthGate.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { LoginPage } from './LoginPage.tsx';
import { MfaChallenge } from './MfaChallenge.tsx';

/** Renders the app only for a fully authenticated session (DESIGN.md §9.1). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <p className="auth-loading">טוען…</p>;
  if (state.status === 'signed_out') return <LoginPage />;
  if (state.status === 'mfa_required') return <MfaChallenge />;
  return <>{children}</>;
}
```

`src/features/auth/AccountMenu.tsx`:

```tsx
import { useAuth } from '../../auth/AuthContext.tsx';
import { Button } from '../../ui/Button.tsx';

/** Header: who is signed in + sign-out. */
export function AccountMenu() {
  const { state, service } = useAuth();
  if (state.status !== 'signed_in') return null;
  return (
    <div className="account-menu">
      <span dir="ltr" className="account-menu__email">
        {state.session.email}
      </span>
      <Button variant="ghost" onClick={() => void service.signOut()}>
        התנתקות
      </Button>
    </div>
  );
}
```

`src/features/auth/auth.css`:

```css
/* Auth screens (spec §3.2). */

.auth-page {
  display: flex;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
}
.auth-card {
  width: 100%;
  max-width: 420px;
}
.auth-hint {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.auth-error {
  margin: 0;
  color: var(--danger);
}
.auth-notice {
  margin: 0;
  color: var(--positive);
}
.auth-loading {
  text-align: center;
  color: var(--muted);
  padding: var(--space-6);
}
.account-menu {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--muted);
}
```

- [ ] **Step 6: Run to verify the tests pass**

Run: `npx vitest run src/features/auth` → Expected: 7 passed.

- [ ] **Step 7: Wire into the app**

`src/app/App.tsx` — import `AccountMenu` and render it in the header after `<nav>`:

```tsx
import { AccountMenu } from '../features/auth/AccountMenu.tsx';
// …inside <header className="app-header">, after </nav>:
        <AccountMenu />
```

`src/main.tsx` — replace the `createRoot(...).render(...)` block with:

```tsx
const root = createRoot(document.getElementById('root')!);

if (!supabase) {
  root.render(
    <p className="auth-loading">
      חסרה הגדרת שרת: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
    </p>,
  );
} else {
  const authService = new SupabaseAuthService(supabase.auth);
  root.render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider service={authService}>
          <AuthGate>
            <AppProviders>
              <App />
            </AppProviders>
          </AuthGate>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
```

and add these imports to `src/main.tsx` (CSS import next to the other feature CSS imports):

```tsx
import { supabase } from './data/supabaseClient.ts';
import { SupabaseAuthService } from './auth/SupabaseAuthService.ts';
import { AuthProvider } from './auth/AuthContext.tsx';
import { AuthGate } from './features/auth/AuthGate.tsx';
import './features/auth/auth.css';
```

- [ ] **Step 8: Full verification and commit**

Run: `npm test` → Expected: all pass. Run: `npm run lint` → clean. Run: `npm run build` → succeeds.

```bash
git add src/auth/AuthContext.tsx src/test/fakeAuth.ts src/features/auth/ src/app/App.tsx src/main.tsx
git commit -m "feat(auth): login gate with sign-up consent, 2FA challenge and sign-out"
```

---

### Task 6: Enable / disable 2FA in Settings

**Files:**
- Create: `src/features/settings/MfaCard.tsx`, `src/features/settings/MfaCard.test.tsx`
- Modify: `src/app/App.tsx` (settings route)

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `AuthService.hasMfa / startMfaEnrollment / confirmMfaEnrollment / disableMfa` (Task 4), `FakeAuthService` (Task 5), `AUTH_ERROR_MESSAGES` (Task 5).
- Produces: `export function MfaCard(): JSX.Element`.

- [ ] **Step 1: Write the failing test** — `src/features/settings/MfaCard.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../auth/AuthContext.tsx';
import { MfaCard } from './MfaCard.tsx';
import { FakeAuthService } from '../../test/fakeAuth.ts';

function renderCard(service: FakeAuthService) {
  return render(
    <AuthProvider service={service}>
      <MfaCard />
    </AuthProvider>,
  );
}

describe('MfaCard', () => {
  it('enrolls 2FA: shows the QR code and secret, rejects a wrong code, accepts the right one', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co' });
    renderCard(service);

    fireEvent.click(await screen.findByRole('button', { name: 'הפעלת אימות דו-שלבי' }));
    expect(await screen.findByAltText('קוד QR לאפליקציית האימות')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('קוד אימות'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'אישור והפעלה' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הקוד שגוי');

    fireEvent.change(screen.getByLabelText('קוד אימות'), {
      target: { value: FakeAuthService.VALID_CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'אישור והפעלה' }));
    expect(await screen.findByText('אימות דו-שלבי פעיל')).toBeInTheDocument();
    expect(service.mfaEnrolled).toBe(true);
  });

  it('disables 2FA when it is on', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co', mfaEnrolled: true, mfaPassed: true });
    renderCard(service);
    fireEvent.click(await screen.findByRole('button', { name: 'כיבוי אימות דו-שלבי' }));
    expect(await screen.findByRole('button', { name: 'הפעלת אימות דו-שלבי' })).toBeInTheDocument();
    expect(service.mfaEnrolled).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/settings/MfaCard.test.tsx` → Expected: FAIL — cannot resolve `./MfaCard.tsx`.

- [ ] **Step 3: Implement `src/features/settings/MfaCard.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useAuth } from '../../auth/AuthContext.tsx';
import type { MfaEnrollment } from '../../auth/AuthService.ts';
import { AUTH_ERROR_MESSAGES } from '../auth/messages.ts';

type View =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'enrolling'; enrollment: MfaEnrollment }
  | { kind: 'on' };

/**
 * Optional TOTP 2FA (spec §3.2). Once on, the database itself requires an aal2
 * session for this user's rows (restrictive RLS), not just the UI.
 */
export function MfaCard() {
  const { service, refresh } = useAuth();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void service.hasMfa().then((on) => {
      if (active) setView({ kind: on ? 'on' : 'off' });
    });
    return () => {
      active = false;
    };
  }, [service]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  const start = () =>
    run(async () => {
      const result = await service.startMfaEnrollment();
      if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
      else setView({ kind: 'enrolling', enrollment: result.value });
    });

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    if (view.kind !== 'enrolling') return;
    void run(async () => {
      const result = await service.confirmMfaEnrollment(view.enrollment.factorId, code.trim());
      if (!result.ok) {
        setError(AUTH_ERROR_MESSAGES[result.error]);
        return;
      }
      setCode('');
      setView({ kind: 'on' });
      await refresh();
    });
  };

  const disable = () =>
    run(async () => {
      const result = await service.disableMfa();
      if (!result.ok) {
        setError(AUTH_ERROR_MESSAGES[result.error]);
        return;
      }
      setView({ kind: 'off' });
      await refresh();
    });

  return (
    <Card title="אימות דו-שלבי">
      {view.kind === 'loading' && <p>…</p>}

      {view.kind === 'off' && (
        <>
          <p>הגנה נוספת על החשבון: בכל התחברות יידרש גם קוד מאפליקציית אימות בטלפון.</p>
          <Button onClick={() => void start()} disabled={pending}>
            הפעלת אימות דו-שלבי
          </Button>
        </>
      )}

      {view.kind === 'enrolling' && (
        <form className="te-form" onSubmit={confirm}>
          <p>
            סרקו את הקוד באפליקציית אימות (Google Authenticator, Microsoft Authenticator) והקלידו
            את הקוד בן 6 הספרות.
          </p>
          <img
            src={view.enrollment.qrCodeSvg}
            alt="קוד QR לאפליקציית האימות"
            width={180}
            height={180}
          />
          <p>
            או הקלידו ידנית: <code dir="ltr">{view.enrollment.secret}</code>
          </p>
          <label className="te-field">
            קוד אימות
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={pending}>
            אישור והפעלה
          </Button>
        </form>
      )}

      {view.kind === 'on' && (
        <>
          <p role="status">אימות דו-שלבי פעיל</p>
          <Button variant="danger" onClick={() => void disable()} disabled={pending}>
            כיבוי אימות דו-שלבי
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/settings` → Expected: MfaCard 2 passed; SettingsPage test still passes.

- [ ] **Step 5: Mount it on the settings route** — in `src/app/App.tsx`:

```tsx
import { MfaCard } from '../features/settings/MfaCard.tsx';
// …
        <Route
          path="/settings"
          element={
            <>
              <SettingsPage />
              <MfaCard />
            </>
          }
        />
```

- [ ] **Step 6: Verify and commit**

Run: `npm test`, `npm run lint`, `npm run build` → all green.

```bash
git add src/features/settings/MfaCard.tsx src/features/settings/MfaCard.test.tsx src/app/App.tsx
git commit -m "feat(auth): enable/disable TOTP 2FA from settings"
```

---

### Task 7: Dashboard configuration, deploy and end-to-end check

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above; production URL `https://hours-tracker-seven-liart.vercel.app`.
- Produces: a working production sign-up → confirm → sign-in → 2FA flow.

- [ ] **Step 1: [USER] Password policy** — Supabase Dashboard → Authentication → Sign In / Providers → Email: *Confirm email* ON; *Minimum password length* **10**; *Password requirements* **Lowercase, uppercase letters, digits and symbols**. Save.

- [ ] **Step 2: [USER] URLs** — Authentication → URL Configuration: *Site URL* `https://hours-tracker-seven-liart.vercel.app`; *Redirect URLs* add `https://hours-tracker-seven-liart.vercel.app/**` and `http://localhost:5173/**`. Save.

- [ ] **Step 3: [USER] Email delivery** — If the project Gmail account + App Password exist: Authentication → Emails → SMTP Settings → enable custom SMTP: host `smtp.gmail.com`, port `465`, user = the Gmail address, password = the App Password, sender name `מעקב שעות עבודה`. Otherwise skip: the built-in mailer only delivers to organization members (fine for the user's own test), and the README states it.

- [ ] **Step 4: Vercel environment variables** — set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview: via Vercel MCP `create_project_env` if its team scope works, otherwise [USER] in Vercel → hours-tracker → Settings → Environment Variables.

- [ ] **Step 5: README** — under `## Security` add:

```markdown
### Authentication & data protection
- Supabase Auth: verified email, password policy (10+ chars, mixed case, digit, symbol), optional TOTP 2FA.
- Every table has Row-Level Security (`user_id = auth.uid()`); once a user enables 2FA, restrictive policies require an `aal2` session at the database level.
- Sign-up requires explicit privacy consent (UI + database trigger); `profiles.plan` is not user-writable.
- Data changes are written to an immutable per-user `audit_log`; logins are in Supabase Auth's audit log.
- Security tests: [`supabase/tests/`](supabase/tests/) (run via Supabase MCP).
```

and, if Step 3 was skipped, under it: `> Note: until custom SMTP is configured, confirmation emails are delivered only to project members.`

Commit:

```bash
git add README.md
git commit -m "docs: README auth and database security"
```

- [ ] **Step 6: Push (ask the user first) and verify production**

After user approval: `git push origin main`; wait for the Vercel deployment to be Ready.
Then [USER] on `https://hours-tracker-seven-liart.vercel.app`:
1. Sign up with a strong password + consent → "נשלח אליך מייל" notice.
2. Click the email link → lands on the production site, signed in (not `localhost`).
3. Settings → enable 2FA → scan QR → enter code → "אימות דו-שלבי פעיל".
4. Sign out → sign in → asked for the 2FA code → app opens.

Claude verifies server-side via MCP: `execute_sql` `select user_id, plan, consent_at from public.profiles;` → one row with `consent_at` set; `select count(*) from auth.mfa_factors where status = 'verified';` → 1; headless Chrome load of the production URL → login screen, 0 CSP violations from app assets.
