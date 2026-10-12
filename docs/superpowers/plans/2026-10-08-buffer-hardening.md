# Buffer — Hardening, Auth Robustness, Safe Restore, Security Documents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the security work that nothing else depends on: database hardening, auth edge cases, a restore that cannot destroy data by accident, and the two security documents. It runs in the end-of-week buffer (Tuesday evening / Wednesday morning) after all "In" features ship. Tasks are independent and can be cut from the end, **except B4 (security documents), which the spec requires**.

**Architecture:** These are small, independent changes to existing code: one migration, two UI/auth fixes and documentation. No new subsystems.

**Tech Stack:** Postgres (RLS, plpgsql), React 19, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-08-kol-shaa-week-design.md](../specs/2026-10-08-kol-shaa-week-design.md) §2 (scope), §12 (risks), together with [2026-10-07-submission-design.md](../specs/2026-10-07-submission-design.md) §3.2 (security controls and documentation). The tasks were moved here from the Friday plan [2026-10-08-day4-privacy-security.md](2026-10-08-day4-privacy-security.md) at the user's request (2026-10-08). The Day 2/3 review backlog items are folded in.

## Global Constraints

The Friday plan's Global Constraints all apply (Supabase ref and SQL-test procedure, secrets, `/api` conventions, Hebrew neutral copy, prettier on touched files only, commit trailer, ask before every push).

**Suggested order if time is short:** B4 → B3 → B2 → B1.

## Review Focus

1. **Supabase cannot be reached when the app starts.** The user gets a message and a retry button, not an endless "טוען…". Pinned: Task B2, "offers a retry when the server cannot be reached, instead of loading forever".
2. **A file that is not a backup (or a backup with no data) is chosen for restore.** An invalid file changes nothing and says so. A valid one asks first, and cancelling changes nothing. Pinned: Task B3's three restore tests.
3. **An open, unattended session tries to turn 2FA off.** It needs a fresh code. Pinned: Task B2, "disables 2FA only with a valid current code".
4. **A client sends a huge or malformed `shifts` payload.** The database rejects it. Pinned: Task B1, `hardening.sql` check 1.
5. **Server-side changes (deletion cascade, webhook) are distinguishable in the audit log.** Pinned: Task B1, `hardening.sql` check 2.

---

### Task B1: Database hardening — linter-clean MFA policies, bounded jsonb, audit actor, RLS regression checks

**Files:**
- Create: `supabase/tests/hardening.sql`, `supabase/migrations/<version>_hardening.sql`
- Modify: `supabase/tests/rls_isolation.sql`, `src/data/database.types.ts`

**Interfaces:**
- Consumes: the Day 2/3 schema (`private.required_aal()`, `private.audit_row()`, and the five `"mfa when enrolled"` policies).
- Produces: `public.audit_log.actor text` (`'user' | 'system'`). Generated types gain `actor` on `audit_log`.

- [ ] **Step 1: Write the failing SQL test** — `supabase/tests/hardening.sql`

```sql
-- Hardening test. Paste into Dashboard → SQL Editor and Run; everything rolls back.
-- Success: one row "hardening: all checks passed". Failure: an exception naming the check.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a5', 'a5@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}');

-- 1. Oversized or malformed shifts are rejected.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  begin
    insert into public.time_entries (user_id, date, shifts)
      values ('00000000-0000-0000-0000-0000000000a5', '2026-10-01',
              (select jsonb_agg(jsonb_build_object('start', '2026-10-01T06:00:00Z', 'end', null))
                 from generate_series(1, 25)));
    raise exception 'FAIL 1a: 25 shifts accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.time_entries (user_id, date, shifts)
      values ('00000000-0000-0000-0000-0000000000a5', '2026-10-01', '{"not": "an array"}');
    raise exception 'FAIL 1b: non-array shifts accepted';
  exception when check_violation then null;
  end;
end $$;

-- 2. The audit log tells user changes from server-side ones.
insert into public.time_entries (user_id, date, shifts)
  values ('00000000-0000-0000-0000-0000000000a5', '2026-10-02', '[]');
reset role;
set local request.jwt.claims = '{}'; -- no user: a server-side change (e.g. account-deletion cascade)
delete from public.time_entries where user_id = '00000000-0000-0000-0000-0000000000a5';
do $$ begin
  if (select actor from public.audit_log
      where table_name = 'time_entries' and action = 'insert'
        and user_id = '00000000-0000-0000-0000-0000000000a5') is distinct from 'user' then
    raise exception 'FAIL 2a: user change not marked actor=user';
  end if;
  if (select actor from public.audit_log
      where table_name = 'time_entries' and action = 'delete'
        and user_id = '00000000-0000-0000-0000-0000000000a5') is distinct from 'system' then
    raise exception 'FAIL 2b: server change not marked actor=system';
  end if;
end $$;

select 'hardening: all checks passed' as result;
rollback;
```

- [ ] **Step 2: User runs it — verify RED.** Expected: `ERROR: FAIL 1a: 25 shifts accepted`.

- [ ] **Step 3: Extend `supabase/tests/rls_isolation.sql`** (regression coverage from the Day 2 review; these pass today and must keep passing). Insert the following **between check 8 and the final `select 'rls_isolation: all checks passed'`**:

```sql
-- 9. Settings are isolated like every other table: B can neither read nor change A's.
reset role;
insert into public.settings (user_id, monthly_quota_minutes, daily_target_minutes, job_percent, work_days,
  auto_break_enabled, auto_break_threshold_minutes, auto_break_deduct_minutes, hours_format, alert_lead_days,
  alerts_enabled, vacation_accrual_per_month, sick_accrual_per_month, vacation_opening_balance, sick_opening_balance)
values ('00000000-0000-0000-0000-00000000000a', 10920, 516, 100, '{0,1,2,3,4}', false, 360, 30, 'hm', 5,
  '{}', 1.5, 1.5, 0, 0);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  if (select count(*) from public.settings) <> 0 then raise exception 'FAIL 9a: B sees A settings'; end if;
  update public.settings set job_percent = 1;
end $$;
reset role;
do $$ begin
  if (select job_percent from public.settings where user_id = '00000000-0000-0000-0000-00000000000a') <> 100 then
    raise exception 'FAIL 9b: B changed A settings';
  end if;
end $$;

-- 10. anon cannot write either.
set local role anon;
do $$ begin
  begin
    insert into public.time_entries (user_id, date, shifts)
      values ('00000000-0000-0000-0000-00000000000a', '2026-10-03', '[]');
    raise exception 'FAIL 10: anon inserted a row';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 11. With 2FA enrolled (check 7), an aal1 session cannot write either.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  begin
    insert into public.time_entries (user_id, date, shifts)
      values ('00000000-0000-0000-0000-00000000000a', '2026-10-04', '[]');
    raise exception 'FAIL 11a: aal1 inserted with 2FA enrolled';
  exception when insufficient_privilege then null;
  end;
  update public.time_entries set note = 'aal1';
  if found then raise exception 'FAIL 11b: aal1 updated with 2FA enrolled'; end if;
end $$;
reset role;
```

- [ ] **Step 4: Write the migration** — `supabase/migrations/hardening.sql` (renamed with the applied version in Step 6)

```sql
-- Hardening (spec §3.2): linter-clean MFA policies, bounded jsonb, audit actor.

-- 1. Same MFA rule, with the JWT read once per statement in the shape the
--    Supabase linter recognises (auth_rls_initplan).
alter policy "mfa when enrolled" on public.profiles
  using (array[(select auth.jwt()) ->> 'aal'] <@ (select private.required_aal()));
alter policy "mfa when enrolled" on public.settings
  using (array[(select auth.jwt()) ->> 'aal'] <@ (select private.required_aal()));
alter policy "mfa when enrolled" on public.time_entries
  using (array[(select auth.jwt()) ->> 'aal'] <@ (select private.required_aal()));
alter policy "mfa when enrolled" on public.absences
  using (array[(select auth.jwt()) ->> 'aal'] <@ (select private.required_aal()));
alter policy "mfa when enrolled" on public.audit_log
  using (array[(select auth.jwt()) ->> 'aal'] <@ (select private.required_aal()));

-- 2. Bounded jsonb: a client could otherwise store megabytes in one row.
--    (CASE, not AND: Postgres does not promise short-circuit evaluation.)
alter table public.time_entries add constraint time_entries_shifts_bounded check (
  case when jsonb_typeof(shifts) = 'array'
    then jsonb_array_length(shifts) <= 24 and pg_column_size(shifts) <= 4096
    else false end
);
alter table public.settings add constraint settings_alerts_bounded check (
  jsonb_typeof(alerts_enabled) = 'object' and pg_column_size(alerts_enabled) <= 2048
);
alter table public.settings add constraint settings_work_days_bounded check (
  cardinality(work_days) <= 7
);

-- 3. Who made the change: 'user' (signed-in request) or 'system' (server side:
--    account-deletion cascade, sign-up trigger, Stripe webhook).
alter table public.audit_log add column actor text not null default 'user'
  check (actor in ('user', 'system'));

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (user_id, action, table_name, row_id, actor)
  values (
    coalesce((select auth.uid()), (r ->> 'user_id')::uuid),
    lower(tg_op),
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'user_id'),
    case when (select auth.uid()) is null then 'system' else 'user' end
  );
  return null;
end;
$$;
```

- [ ] **Step 5: Check that existing rows satisfy the new constraints** (MCP `execute_sql`, read-only)

```sql
select
  (select count(*) from public.time_entries
    where jsonb_typeof(shifts) <> 'array' or jsonb_array_length(shifts) > 24
       or pg_column_size(shifts) > 4096) as bad_shifts,
  (select count(*) from public.settings
    where jsonb_typeof(alerts_enabled) <> 'object' or pg_column_size(alerts_enabled) > 2048
       or cardinality(work_days) > 7) as bad_settings;
```
Expected: `0, 0`. If not, stop and report to the user.

- [ ] **Step 6: Apply.** Use MCP `apply_migration` (name `hardening`), then `list_migrations`, then rename the file to its applied version. If the call is declined, use the Global Constraints fallback.

- [ ] **Step 7: User reruns both tests — verify GREEN.** Expected: `hardening: all checks passed` and `rls_isolation: all checks passed`.

- [ ] **Step 8: Advisors.** Run MCP `get_advisors` (`performance`, then `security`). Expected: no `auth_rls_initplan` findings. Security shows only `auth_leaked_password_protection`, a Pro-plan feature that is documented in Task B4.

- [ ] **Step 9: Regenerate types** as in Friday Task 1 Step 6. The diff shows only `actor` on `audit_log`. Then run `npx tsc -b`.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations supabase/tests/hardening.sql supabase/tests/rls_isolation.sql src/data/database.types.ts
git commit -m "feat(db): bounded jsonb, audit actor; linter-clean MFA policies; RLS regression checks"
```

---

### Task B2: Auth robustness — retry instead of endless loading, fail-closed 2FA level, code to disable 2FA

**Files:**
- Modify: `src/auth/AuthContext.tsx`, `src/features/auth/AuthGate.tsx`, `src/features/auth/AuthGate.test.tsx`, `src/auth/AuthService.ts`, `src/auth/SupabaseAuthService.ts`, `src/auth/SupabaseAuthService.test.ts`, `src/test/fakeAuth.ts`, `src/features/settings/MfaCard.tsx`, `src/features/settings/MfaCard.test.tsx`

**Interfaces:**
- Consumes: `AuthService` from Task 3.
- Produces: `AuthState` gains `{ status: 'error' }`. `AuthService.disableMfa(code: string): Promise<AuthResult>`. `SupabaseAuthService.getAssurance()` throws when the level cannot be read. `FakeAuthService.failGetSession: boolean`.

- [ ] **Step 1: Write the failing tests**

`src/features/auth/AuthGate.test.tsx`: add
```tsx
  it('offers a retry when the server cannot be reached, instead of loading forever', async () => {
    const service = new FakeAuthService({ signedInAs: 'a@b.co' });
    service.failGetSession = true;
    renderGate(service);
    expect(await screen.findByRole('alert')).toHaveTextContent('אין חיבור לשרת');
    service.failGetSession = false;
    fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף' }));
    expect(await screen.findByText('תוכן האפליקציה')).toBeInTheDocument();
  });
```

`src/auth/SupabaseAuthService.test.ts`: add
```ts
  it('throws when the assurance level cannot be read (never assumes 2FA is off)', async () => {
    const auth = fakeAuth();
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    });
    await expect(serviceFor(auth).getAssurance()).rejects.toThrow('boom');
  });

  it('does not disable 2FA without a valid current code', async () => {
    const auth = fakeAuth();
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [{ id: 'f9' }] }, error: null });
    auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: { code: 'mfa_verification_failed', status: 422, name: 'AuthApiError' },
    });
    expect(await serviceFor(auth).disableMfa('000000')).toEqual({ ok: false, error: 'invalid_code' });
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();
  });
```
Change the existing test `'disables 2FA by unenrolling the factor and refreshing the session'` to call `disableMfa('123456')`, and add this before the `unenroll` assertion:
```ts
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f9', code: '123456' });
```

`src/features/settings/MfaCard.test.tsx`: replace the test `'disables 2FA when it is on'` with
```tsx
  it('disables 2FA only with a valid current code', async () => {
    const service = new FakeAuthService({
      signedInAs: 'a@b.co',
      mfaEnrolled: true,
      mfaPassed: true,
    });
    renderCard(service);
    const codeInput = await screen.findByLabelText('קוד נוכחי מאפליקציית האימות');

    fireEvent.change(codeInput, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'כיבוי אימות דו-שלבי' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הקוד שגוי');
    expect(service.mfaEnrolled).toBe(true);

    fireEvent.change(codeInput, { target: { value: FakeAuthService.VALID_CODE } });
    fireEvent.click(screen.getByRole('button', { name: 'כיבוי אימות דו-שלבי' }));
    expect(await screen.findByRole('button', { name: 'הפעלת אימות דו-שלבי' })).toBeInTheDocument();
    expect(service.mfaEnrolled).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/auth src/features/auth src/features/settings/MfaCard.test.tsx`
Expected: FAIL. There is no 'ניסיון נוסף' button, `getAssurance` resolves instead of rejecting, `unenroll` is called despite the wrong code, and there is no code field.

- [ ] **Step 3: Implement**

`src/auth/AuthContext.tsx`: add `| { status: 'error' }` to `AuthState`, and wrap the body of `refresh` in a try/catch:
```ts
  const refresh = useCallback(async () => {
    try {
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
    } catch {
      // Unknown session or 2FA level: show a retry, never the app (fail closed).
      setState({ status: 'error' });
    }
  }, [service]);
```

`src/features/auth/AuthGate.tsx`:
```tsx
import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { Button } from '../../ui/Button.tsx';
import { LoginPage } from './LoginPage.tsx';
import { MfaChallenge } from './MfaChallenge.tsx';
import { AUTH_ERROR_MESSAGES } from './messages.ts';

/** Renders the app only for a fully authenticated session (DESIGN.md §9.1). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, refresh } = useAuth();
  if (state.status === 'loading') return <p className="auth-loading">טוען…</p>;
  if (state.status === 'error')
    return (
      <div className="auth-loading">
        <p role="alert">{AUTH_ERROR_MESSAGES.network}</p>
        <Button onClick={() => void refresh()}>ניסיון נוסף</Button>
      </div>
    );
  if (state.status === 'signed_out') return <LoginPage />;
  if (state.status === 'mfa_required') return <MfaChallenge />;
  return <>{children}</>;
}
```

`src/auth/AuthService.ts`: change the `disableMfa` declaration to
```ts
  /** Requires a fresh code from the authenticator (step-up): an open session alone cannot remove 2FA. */
  disableMfa(code: string): Promise<AuthResult>;
```

`src/auth/SupabaseAuthService.ts`:
```ts
  async getAssurance() {
    const { data, error } = await this.auth.mfa.getAuthenticatorAssuranceLevel();
    // An unknown level must not read as "2FA not required": AuthProvider shows a retry.
    if (error || !data) throw new Error(`Supabase: ${error?.message ?? 'no assurance level'}`);
    return { current: level(data.currentLevel), next: level(data.nextLevel) };
  }
```
```ts
  async disableMfa(code: string): Promise<AuthResult> {
    const factorId = await this.verifiedFactorId();
    if (!factorId) return ok(null);
    const verified = await this.auth.mfa.challengeAndVerify({ factorId, code });
    if (verified.error) return fail(verified.error);
    const { error } = await this.auth.mfa.unenroll({ factorId });
    if (error) return fail(error);
    await this.auth.refreshSession(); // drop aal2 now, not at the next token refresh
    return ok(null);
  }
```

`src/test/fakeAuth.ts`: add the field `failGetSession = false;` and change these methods:
```ts
  async getSession() {
    if (this.failGetSession) throw new Error('network down');
    return this.session;
  }
```
```ts
  async disableMfa(code: string): Promise<AuthResult> {
    if (code !== FakeAuthService.VALID_CODE) return { ok: false, error: 'invalid_code' };
    this.mfaEnrolled = false;
    this.mfaPassed = false;
    return ok(null);
  }
```

`src/features/settings/MfaCard.tsx`: replace `disable` and the `'on'` view:
```tsx
  const disable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await service.disableMfa(code.trim());
      if (!result.ok) {
        setError(AUTH_ERROR_MESSAGES[result.error]);
        return;
      }
      setCode('');
      setView({ kind: 'off' });
      await refresh();
    });
  };
```
```tsx
      {view.kind === 'on' && (
        <form className="te-form" onSubmit={disable}>
          <p role="status">אימות דו-שלבי פעיל</p>
          <label className="te-field">
            קוד נוכחי מאפליקציית האימות
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
          <Button type="submit" variant="danger" disabled={pending}>
            כיבוי אימות דו-שלבי
          </Button>
        </form>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/auth src/features/auth src/features/settings`
Expected: PASS.

- [ ] **Step 5: Full checks and commit**

Run: `npx tsc -b`, `npm run lint`, `npm test`. Expected: all green.
```bash
npx prettier --write src/auth/AuthContext.tsx src/auth/AuthService.ts src/auth/SupabaseAuthService.ts src/auth/SupabaseAuthService.test.ts src/features/auth/AuthGate.tsx src/features/auth/AuthGate.test.tsx src/test/fakeAuth.ts src/features/settings/MfaCard.tsx src/features/settings/MfaCard.test.tsx
git add src/auth src/features/auth src/test/fakeAuth.ts src/features/settings/MfaCard.tsx src/features/settings/MfaCard.test.tsx
git commit -m "fix(auth): retry instead of endless loading, fail-closed 2FA level, code required to disable 2FA"
```

---

### Task B3: Safe restore and whole-minute validation

**Files:**
- Modify: `src/domain/validation.ts`, `src/domain/validation.test.ts`, `src/features/reports/ReportsPage.tsx`, `src/features/reports/ReportsPage.test.tsx`

**Interfaces:**
- Consumes: `parseBackup(json: string): DatasetSnapshot` (`src/data/backup.ts`, existing; throws on malformed input), `Repository.importAll`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

`src/domain/validation.test.ts`: add inside `describe('validateEntry', …)`
```ts
  it('flags fractional minutes as invalid input (the database stores whole minutes)', () => {
    const withBreak = makeEntry({
      shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T10:00:00.000Z')],
      breakMinutes: 7.5,
    });
    expect(codes(withBreak)).toContain<ValidationCode>('invalid_input');
    const manual = makeEntry({ shifts: [], manualMinutes: 90.5 });
    expect(codes(manual)).toContain<ValidationCode>('invalid_input');
  });
```

`src/features/reports/ReportsPage.test.tsx`: add the following. Add imports at the top as needed: `waitFor` from `@testing-library/react`.
```tsx
  describe('restore from backup', () => {
    async function setupWithOneEntry() {
      const repo = new LocalStorageRepository(memoryStorage());
      await repo.upsertEntry(makeEntry({ date: '2026-06-10' }));
      const view = render(<ReportsPage month="2026-06" zone={ZONE} />, {
        wrapper: createWrapper(repo),
      });
      await screen.findByRole('button', { name: /שחזור מגיבוי/ });
      const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
      const choose = (content: string) =>
        fireEvent.change(input, {
          target: { files: [new File([content], 'backup.json', { type: 'application/json' })] },
        });
      return { repo, choose };
    }

    it('asks before replacing the data, and cancelling changes nothing', async () => {
      const { repo, choose } = await setupWithOneEntry();
      const empty = { ...(await repo.exportAll()), entries: [], absences: [] };
      choose(JSON.stringify(empty));
      expect(
        await screen.findByText(/יחליף את כל הנתונים בחשבון ב-0 ימי דיווח ו-0 היעדרויות/),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
      expect((await repo.exportAll()).entries).toHaveLength(1);
    });

    it('replaces the data after confirmation', async () => {
      const { repo, choose } = await setupWithOneEntry();
      const empty = { ...(await repo.exportAll()), entries: [], absences: [] };
      choose(JSON.stringify(empty));
      fireEvent.click(await screen.findByRole('button', { name: 'שחזור והחלפה' }));
      expect(await screen.findByRole('status')).toHaveTextContent('הגיבוי שוחזר');
      await waitFor(async () => expect((await repo.exportAll()).entries).toHaveLength(0));
    });

    it('rejects a file that is not a backup and changes nothing', async () => {
      const { repo, choose } = await setupWithOneEntry();
      choose('this is not json');
      expect(await screen.findByRole('alert')).toHaveTextContent('הקובץ אינו גיבוי תקין');
      expect(screen.queryByRole('button', { name: 'שחזור והחלפה' })).not.toBeInTheDocument();
      expect((await repo.exportAll()).entries).toHaveLength(1);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/validation.test.ts src/features/reports`
Expected: FAIL. Fractional values pass validation, there is no confirmation text, and the invalid file throws without showing an alert.

- [ ] **Step 3: Implement**

`src/domain/validation.ts`: `Number.isInteger` also rejects NaN and ±Infinity, so it replaces `Number.isFinite` in both checks:
```ts
    if (!Number.isInteger(entry.manualMinutes) || entry.manualMinutes < 0) {
```
```ts
  if (!Number.isInteger(entry.breakMinutes) || entry.breakMinutes < 0) {
```

`src/features/reports/ReportsPage.tsx`:
- Replace the `DatasetSnapshot` type import with `import { parseBackup } from '../../data/backup.ts';` and `import type { DatasetSnapshot } from '../../data/Repository.ts';` (both are used).
- Next to the other hooks, **before** the early `return`, add:
```tsx
  const [pendingRestore, setPendingRestore] = useState<DatasetSnapshot | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
```
- Replace `importJson` with:
```tsx
  async function chooseBackup(file: File) {
    setRestoreError(null);
    setRestoreNotice(null);
    try {
      setPendingRestore(parseBackup(await file.text()));
    } catch {
      setRestoreError('הקובץ אינו גיבוי תקין של האפליקציה. שום נתון לא השתנה.');
    }
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    try {
      await repository.importAll(pendingRestore);
      await queryClient.invalidateQueries();
      setPendingRestore(null);
      setRestoreNotice('הגיבוי שוחזר.');
    } catch {
      setPendingRestore(null);
      setRestoreError('השחזור נכשל. הנתונים בחשבון לא השתנו.');
    }
  }
```
- In the file input's `onChange`: call `void chooseBackup(file)` and then `e.target.value = ''` (so the same file can be chosen again).
- After `.report__actions`, replace the stale "browser only" warning paragraph with:
```tsx
        {pendingRestore && (
          <div className="report__confirm">
            <p>
              השחזור יחליף את כל הנתונים בחשבון ב-{pendingRestore.entries.length} ימי דיווח ו-
              {pendingRestore.absences.length} היעדרויות מהקובץ. להמשיך?
            </p>
            <Button variant="danger" onClick={() => void confirmRestore()}>
              שחזור והחלפה
            </Button>
            <Button variant="ghost" onClick={() => setPendingRestore(null)}>
              ביטול
            </Button>
          </div>
        )}
        {restoreError && (
          <p role="alert" className="auth-error">
            {restoreError}
          </p>
        )}
        {restoreNotice && <p role="status">{restoreNotice}</p>}

        <p className="report__warning">
          הנתונים נשמרים בחשבון שלכם ומסונכרנים בין המכשירים. גיבוי JSON הוא עותק אישי — מומלץ
          להוריד אחד מדי פעם.
        </p>
```
Note: the JSX text `ב-{…} ימי דיווח ו-{…} היעדרויות` must render as the single string the test matches. If prettier splits it across lines so that whitespace changes the text, use one template literal: `{`השחזור יחליף את כל הנתונים בחשבון ב-${pendingRestore.entries.length} ימי דיווח ו-${pendingRestore.absences.length} היעדרויות מהקובץ. להמשיך?`}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/validation.test.ts src/features/reports`
Expected: PASS.

- [ ] **Step 5: Full checks and commit**

Run: `npx tsc -b`, `npm run lint`, `npm test`. Expected: all green.
```bash
npx prettier --write src/domain/validation.ts src/domain/validation.test.ts src/features/reports/ReportsPage.tsx src/features/reports/ReportsPage.test.tsx
git add src/domain/validation.ts src/domain/validation.test.ts src/features/reports/ReportsPage.tsx src/features/reports/ReportsPage.test.tsx
git commit -m "fix: restore asks first and rejects non-backup files; minutes must be whole"
```

---

### Task B4: Security documents, supply chain, auth-log persistence, README

**Files:**
- Create: `docs/security/DATABASE-DEFINITION.md`, `docs/security/SECURITY-PROCEDURE.md`, `.github/dependabot.yml`
- Modify: `README.md` (title + Security section), `supabase/README.md`

**Interfaces:**
- Consumes: everything shipped by then (the documents describe the system as it is on the day they are written, including the features from Sunday to Tuesday).
- Produces: the spec §3.2 "Documentation" and "Supply chain" rows.

- [ ] **Step 1: `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

- [ ] **Step 2: Dependency audit.** Run `npm audit --omit=dev`.
  - Expected: `found 0 vulnerabilities`.
  - If there are findings, record each one (package, severity, whether it is reachable) in SECURITY-PROCEDURE §8 and tell the user.
  - Do not run `npm audit fix --force`.

- [ ] **Step 3: Auth-log persistence (user).**
  - In **Supabase → Authentication → Audit Logs**, turn on writing auth audit logs to the project database. In some dashboards this is a toggle named "Disable writing auth audit logs to project database", which must then be **off**.
  - After the user signs in once, run MCP `execute_sql`: `select count(*) from auth.audit_log_entries;`. Expected: > 0. It was 0 on 2026-10-08.

- [ ] **Step 4: `docs/security/DATABASE-DEFINITION.md`** (Hebrew; מסמך הגדרות מאגר, תקנה 2 לתקנות הגנת הפרטיות (אבטחת מידע), 2017). Required sections and facts:
  1. **שם המאגר ותיאורו:** "כל שעה" (repo `hours-tracker`), a personal work-hours tracker with a labour-rights checker. Production URL `https://hours-tracker-seven-liart.vercel.app`.
  2. **בעלת המאגר ואחראית אבטחה:** `OWNER_NAME` and `CONTACT_EMAIL`, the same values as `src/features/legal/contact.ts`.
  3. **מטרות השימוש:** the same as the privacy page's "למה".
  4. **סוגי המידע:**
     - A table per Postgres table (`profiles`, `settings` including wage fields, `time_entries`, `absences`, `audit_log`, `private.rate_limits`, `email_log`, `stripe_events`, Supabase `auth.*`), with the columns that hold personal data.
     - Note that `absences.type = 'sick'` may count as health information ("מידע בעל רגישות מיוחדת" under Amendment 13).
  5. **רמת אבטחה:**
     - *בינונית*. This is conservative, because sick-leave dates may be health information; "basic" would otherwise apply given the number of users.
     - Then list the controls implemented beyond that level (spec §3.2).
  6. **מחזיקים / ספקי עיבוד:**
     - Supabase (DB + Auth, Frankfurt, EU).
     - Vercel (hosting + functions).
     - Google Gemini (AI, free tier: anonymised summaries only).
     - Gmail (email).
     - Stripe (payments).

     The EU is a permitted transfer destination; for the others, state the safeguard (minimisation, no card data).
  7. **מורשי גישה:**
     - End users: own rows only, enforced by RLS.
     - Administrator: the owner only, via Supabase/Vercel/GitHub/Stripe dashboards, each with 2FA.
     - Secret keys are held only in Vercel env.
  8. **זרימת מידע:** browser → Vercel (HTTPS) → Supabase. `/api` uses the secret key server-side.
  9. **שמירה ומחיקה:**
     - Data is kept until the account is deleted.
     - Account deletion cascades.
     - `audit_log` is kept ≥ 24 months (pseudonymous id).
  10. **סיכונים עיקריים ומענה:**
      - Account takeover → password policy + 2FA + rate limits.
      - Cross-user access → RLS + SQL isolation tests.
      - Key leak → server-only keys and the rotation procedure (SECURITY-PROCEDURE).
      - Data loss → JSON export. State that the Supabase Free plan has no downloadable backups.
  11. **Out of scope:** formal risk survey and external penetration test (spec §3.2).

- [ ] **Step 5: `docs/security/SECURITY-PROCEDURE.md`** (Hebrew; נוהל אבטחת מידע, תקנה 4). Required sections:
  1. **בקרת גישה:**
     - User auth: email verification; password ≥ 10 chars with mixed classes; optional TOTP 2FA, enforced in the DB once enrolled.
     - Admin access only through dashboards with 2FA.
  2. **ניהול סודות:**
     - Where each secret lives: the env vars listed in spec §9 are in Vercel as *Sensitive*. The publishable key is public by design.
     - Secrets are never in git or chat.
     - **Rotation:** create a new key at the provider → update Vercel → redeploy → revoke the old key.
  3. **רישום ובקרה:**
     - `audit_log`: insert/update/delete with `actor`; users can only read their own rows.
     - Auth logins: `auth.audit_log_entries` (Step 3).
     - Review the logs monthly and after any incident.
  4. **הגנת יישום:** security headers (`vercel.json`), CSP without inline scripts, zod validation on every `/api` input, fail-closed rate limits, Stripe webhook signature verification, and bounded jsonb and text lengths in the DB.
  5. **גיבוי ושחזור:** user-side JSON export/restore, with confirmation. State the Free-plan limitation.
  6. **טיפול באירוע אבטחה:**
     - Contain: rotate keys, revoke sessions.
     - Assess and record.
     - For a severe incident (אירוע אבטחה חמור), notify the Privacy Protection Authority (הרשות להגנת הפרטיות) as the regulations require, and inform affected users.
  7. **ניהול שינויים:**
     - Every change goes through git with tests.
     - Run `/security-review` before submission.
     - Migrations are versioned in `supabase/migrations`; the SQL security tests in `supabase/tests` are rerun after each migration.
  8. **שרשרת אספקה:** Dependabot weekly, and `npm audit --omit=dev` before each release. Record the result of Step 2 with its date.
  9. **מגבלות ידועות:**
     - Leaked-password protection (HaveIBeenPwned) needs the Supabase Pro plan, so it is off.
     - The Gmail sender is `@gmail.com`.
     - Gemini runs on the free tier.
  10. **סקירה תקופתית:** this procedure and DATABASE-DEFINITION are reviewed yearly, or on any material change.

- [ ] **Step 6: README and supabase/README**
  - `README.md`:
    - Change the title to `# כל שעה — כל שעה נחשבת (hours-tracker)`.
    - In "Authentication & data protection", replace the sentence "Logins are captured… scheduled for the privacy work (Day 4)" with the result of Step 3.
    - Add bullets for: account deletion (Settings → מחיקת חשבון; `POST /api/delete-account`), the public legal pages (`/privacy`, `/terms`, `/accessibility`), rate limiting on `/api`, and links to the two security documents.
  - `supabase/README.md`: list `tests/rate_limit.sql` and `tests/hardening.sql` next to the other tests.

- [ ] **Step 7: Commit**

```bash
npx prettier --write docs/security/DATABASE-DEFINITION.md docs/security/SECURITY-PROCEDURE.md README.md supabase/README.md .github/dependabot.yml
git add docs/security .github/dependabot.yml README.md supabase/README.md
git commit -m "docs(security): database definition, security procedure, Dependabot"
```

---

