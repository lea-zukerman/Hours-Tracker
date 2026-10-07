-- RLS isolation test. Paste into Dashboard → SQL Editor and Run; everything rolls back.
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
