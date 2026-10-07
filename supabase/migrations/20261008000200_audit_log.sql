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
