-- Day 3: cloud repository support (DESIGN.md §9.3).

-- updated_at is always set by the database (last write wins; clients cannot forge it).
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_updated_at before insert or update on public.settings
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before insert or update on public.time_entries
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before insert or update on public.absences
  for each row execute function private.touch_updated_at();

-- Whole-dataset restore/migration as ONE transaction: all rows are replaced or nothing changes.
-- SECURITY INVOKER: RLS and the MFA policies still apply; ownership is forced to the caller.
create function public.import_dataset(
  p_settings jsonb,
  p_entries jsonb,
  p_absences jsonb,
  p_name text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  delete from public.time_entries where user_id = uid;
  delete from public.absences where user_id = uid;

  insert into public.settings (
    user_id, monthly_quota_minutes, daily_target_minutes, job_percent, work_days,
    auto_break_enabled, auto_break_threshold_minutes, auto_break_deduct_minutes, hours_format,
    alert_lead_days, alerts_enabled, vacation_accrual_per_month, sick_accrual_per_month,
    vacation_opening_balance, sick_opening_balance
  )
  select uid, s.monthly_quota_minutes, s.daily_target_minutes, s.job_percent, s.work_days,
    s.auto_break_enabled, s.auto_break_threshold_minutes, s.auto_break_deduct_minutes, s.hours_format,
    s.alert_lead_days, s.alerts_enabled, s.vacation_accrual_per_month, s.sick_accrual_per_month,
    s.vacation_opening_balance, s.sick_opening_balance
  from jsonb_populate_record(null::public.settings, p_settings) s
  on conflict (user_id) do update set
    monthly_quota_minutes = excluded.monthly_quota_minutes,
    daily_target_minutes = excluded.daily_target_minutes,
    job_percent = excluded.job_percent,
    work_days = excluded.work_days,
    auto_break_enabled = excluded.auto_break_enabled,
    auto_break_threshold_minutes = excluded.auto_break_threshold_minutes,
    auto_break_deduct_minutes = excluded.auto_break_deduct_minutes,
    hours_format = excluded.hours_format,
    alert_lead_days = excluded.alert_lead_days,
    alerts_enabled = excluded.alerts_enabled,
    vacation_accrual_per_month = excluded.vacation_accrual_per_month,
    sick_accrual_per_month = excluded.sick_accrual_per_month,
    vacation_opening_balance = excluded.vacation_opening_balance,
    sick_opening_balance = excluded.sick_opening_balance;

  insert into public.time_entries (id, user_id, date, shifts, break_minutes, manual_minutes, note)
  select e.id, uid, e.date, e.shifts, coalesce(e.break_minutes, 0), e.manual_minutes, e.note
  from jsonb_populate_recordset(null::public.time_entries, coalesce(p_entries, '[]'::jsonb)) e;

  insert into public.absences (id, user_id, date_from, date_to, type, partial_minutes, note)
  select a.id, uid, a.date_from, a.date_to, a.type, a.partial_minutes, a.note
  from jsonb_populate_recordset(null::public.absences, coalesce(p_absences, '[]'::jsonb)) a;

  if p_name is not null then
    update public.profiles set name = p_name where user_id = uid;
  end if;
end;
$$;

revoke execute on function public.import_dataset(jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.import_dataset(jsonb, jsonb, jsonb, text) to authenticated;
