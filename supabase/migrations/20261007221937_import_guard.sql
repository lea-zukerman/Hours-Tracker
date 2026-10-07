-- Day 3 review fix: moving browser data into an account must never overwrite cloud
-- data, even when data arrived after the offer was shown (another tab or device, a
-- clock-in on the dashboard). The emptiness check therefore runs here, inside the
-- import transaction, under a per-user lock — not only in the browser.

drop function public.import_dataset(jsonb, jsonb, jsonb, text);

create function public.import_dataset(
  p_settings jsonb,
  p_entries jsonb,
  p_absences jsonb,
  p_name text default null,
  p_require_empty boolean default false
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

  -- One import at a time per user: concurrent imports queue on the caller's profile row.
  perform 1 from public.profiles where user_id = uid for update;

  if p_require_empty and (
       exists (select 1 from public.time_entries where user_id = uid)
    or exists (select 1 from public.absences where user_id = uid)
  ) then
    raise exception 'account already has data' using errcode = 'object_not_in_prerequisite_state';
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

revoke execute on function public.import_dataset(jsonb, jsonb, jsonb, text, boolean) from public, anon;
grant execute on function public.import_dataset(jsonb, jsonb, jsonb, text, boolean) to authenticated;
