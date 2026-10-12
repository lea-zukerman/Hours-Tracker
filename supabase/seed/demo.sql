-- Demo data for the presentation account (spec §8 "Demo account").
-- 1. Sign up the demo account in the app and confirm its email.
-- 2. Put its email in v_email below, paste this file into Dashboard → SQL Editor, Run.
-- Re-runnable: it first deletes that account's entries and absences (nothing else).
-- Covers 2 August – 11 October 2026: regular days, long days (overtime), a short
-- day, a vacation week, a 3-day sick run and the Rosh Hashana / Yom Kippur holidays.
do $$
declare
  v_email text := 'CHANGE_ME@gmail.com';
  v_uid uuid;
  d date;
  i int := 0;
  start_min int;
  len int;
  brk int;
  s timestamp;
  e timestamp;
  iso constant text := 'YYYY-MM-DD"T"HH24:MI:SS".000Z"';
begin
  select id into v_uid from auth.users where email = lower(v_email);
  if v_uid is null then
    raise exception 'No user with email %', v_email;
  end if;

  delete from public.time_entries where user_id = v_uid;
  delete from public.absences where user_id = v_uid;

  insert into public.absences (user_id, date_from, date_to, type, note) values
    (v_uid, '2026-08-16', '2026-08-20', 'vacation', 'חופשה משפחתית'),
    (v_uid, '2026-09-13', '2026-09-13', 'holiday', 'ראש השנה'),
    (v_uid, '2026-09-21', '2026-09-21', 'holiday', 'יום כיפור'),
    (v_uid, '2026-09-28', '2026-09-30', 'sick', null);

  for d in select generate_series('2026-08-02'::date, '2026-10-11'::date, interval '1 day')::date loop
    continue when extract(isodow from d) in (5, 6); -- Friday, Saturday
    continue when d between '2026-08-16' and '2026-08-20'
               or d between '2026-09-28' and '2026-09-30'
               or d in ('2026-09-13', '2026-09-21');
    i := i + 1;
    start_min := 7 * 60 + 30 + ((i * 17) % 61); -- 07:30–08:30 local time
    len := case
      when i % 11 = 0 then 720              -- a 12-hour day
      when i % 5 = 0 then 630               -- 10.5-hour days (overtime)
      when i % 7 = 0 then 420               -- a short 7-hour day
      else 525 + ((i * 13) % 45)            -- 8:45–9:30 presence
    end;
    brk := case when i % 9 = 0 then 15 else 30 end;
    -- Israel is UTC+3 until 25 October 2026.
    s := d::timestamp + make_interval(mins => start_min) - interval '3 hours';
    e := s + make_interval(mins => len);
    insert into public.time_entries (user_id, date, shifts, break_minutes, note)
    values (
      v_uid,
      d,
      jsonb_build_array(jsonb_build_object('start', to_char(s, iso), 'end', to_char(e, iso))),
      brk,
      case when i % 6 = 0 then 'סגירת פרויקט' when i % 10 = 0 then 'ישיבת צוות ארוכה' end
    );
  end loop;

  raise notice 'Demo data loaded for %: % workdays', v_email, i;
end $$;
