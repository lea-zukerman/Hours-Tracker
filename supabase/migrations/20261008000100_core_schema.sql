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
