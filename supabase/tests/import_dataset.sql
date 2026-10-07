-- import_dataset test. Paste into Dashboard → SQL Editor and Run; everything rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test.local', 'authenticated', 'authenticated', '{"privacy_consent": true}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated", "aal": "aal1"}';
insert into public.time_entries (id, user_id, date, shifts, break_minutes)
  values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000a2', '2026-09-01', '[]', 0);

-- 1. Import replaces A's dataset, and every row is owned by the caller even though the payload says B.
select public.import_dataset(
  '{"user_id": "00000000-0000-0000-0000-0000000000b2", "monthly_quota_minutes": 10920, "daily_target_minutes": 516,
    "job_percent": 80, "work_days": [0,1,2,3,4], "auto_break_enabled": false, "auto_break_threshold_minutes": 360,
    "auto_break_deduct_minutes": 30, "hours_format": "hm", "alert_lead_days": 5, "alerts_enabled": {},
    "vacation_accrual_per_month": 1.5, "sick_accrual_per_month": 1.5, "vacation_opening_balance": 0,
    "sick_opening_balance": 0}',
  '[{"id": "33333333-3333-3333-3333-333333333333", "user_id": "00000000-0000-0000-0000-0000000000b2",
     "date": "2026-10-01", "shifts": [], "break_minutes": 0, "manual_minutes": null, "note": "x"},
    {"id": "44444444-4444-4444-4444-444444444444", "user_id": "00000000-0000-0000-0000-0000000000b2",
     "date": "2026-10-02", "shifts": [], "break_minutes": 15}]',
  '[{"id": "55555555-5555-5555-5555-555555555555", "user_id": "00000000-0000-0000-0000-0000000000b2",
     "date_from": "2026-10-05", "date_to": "2026-10-06", "type": "vacation"}]',
  'Imported Name');

do $$ begin
  if exists (select 1 from public.time_entries where id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL 1a: old entry not replaced';
  end if;
  if (select count(*) from public.time_entries where user_id = '00000000-0000-0000-0000-0000000000a2') <> 2 then
    raise exception 'FAIL 1b: imported entries missing or not owned by caller';
  end if;
  if (select count(*) from public.absences where user_id = '00000000-0000-0000-0000-0000000000a2') <> 1 then
    raise exception 'FAIL 1c: imported absence missing or not owned by caller';
  end if;
  if (select job_percent from public.settings where user_id = '00000000-0000-0000-0000-0000000000a2') is distinct from 80 then
    raise exception 'FAIL 1d: settings not imported for caller';
  end if;
  if (select name from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a2') is distinct from 'Imported Name' then
    raise exception 'FAIL 1e: profile name not imported';
  end if;
end $$;

-- 2. A failing import changes nothing (one transaction).
do $$ begin
  begin
    perform public.import_dataset(
      '{"monthly_quota_minutes": 10920, "daily_target_minutes": 516, "job_percent": 100, "work_days": [0],
        "auto_break_enabled": false, "auto_break_threshold_minutes": 360, "auto_break_deduct_minutes": 30,
        "hours_format": "hm", "alert_lead_days": 5, "alerts_enabled": {}, "vacation_accrual_per_month": 0,
        "sick_accrual_per_month": 0, "vacation_opening_balance": 0, "sick_opening_balance": 0}',
      '[{"id": "66666666-6666-6666-6666-666666666666", "date": "2026-11-01", "shifts": [], "break_minutes": 0}]',
      '[{"id": "77777777-7777-7777-7777-777777777777", "date_from": "2026-11-05", "date_to": "2026-11-01", "type": "sick"}]',
      null);
    raise exception 'FAIL 2a: invalid import did not fail';
  exception when check_violation then null;
  end;
  if (select count(*) from public.time_entries) <> 2 or exists (select 1 from public.time_entries where id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'FAIL 2b: failed import left partial changes';
  end if;
  if (select job_percent from public.settings) is distinct from 80 then
    raise exception 'FAIL 2c: failed import changed settings';
  end if;
end $$;

-- 3. Clients cannot forge updated_at.
update public.time_entries set updated_at = '2000-01-01' where id = '33333333-3333-3333-3333-333333333333';
do $$ begin
  if (select updated_at from public.time_entries where id = '33333333-3333-3333-3333-333333333333') < '2001-01-01' then
    raise exception 'FAIL 3: client-supplied updated_at was kept';
  end if;
end $$;

-- 4. B got nothing from A's import.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  if (select count(*) from public.time_entries) <> 0 then raise exception 'FAIL 4: import leaked rows to B'; end if;
end $$;

-- 5. anon cannot call it.
reset role;
set local role anon;
do $$ begin
  begin
    perform public.import_dataset('{}', '[]', '[]', null);
    raise exception 'FAIL 5: anon executed import_dataset';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'import_dataset: all checks passed' as result;
rollback;
