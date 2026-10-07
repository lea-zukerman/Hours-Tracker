-- Audit log test. Paste into Dashboard → SQL Editor and Run; everything rolls back.
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
  -- `is distinct from`, not `<>`: array_agg over zero rows is NULL, which `<>` would let pass.
  if (select array_agg(action order by id) from public.audit_log where table_name = 'time_entries')
     is distinct from array['insert', 'update', 'delete'] then
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

-- 3. B sees only their own audit rows (their sign-up profile insert), none of A's.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "aal": "aal1"}';
do $$ begin
  if exists (select 1 from public.audit_log
             where user_id is distinct from '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL 3a: B sees audit rows that are not theirs';
  end if;
  if not exists (select 1 from public.audit_log where table_name = 'profiles' and action = 'insert') then
    raise exception 'FAIL 3b: B cannot read their own audit rows';
  end if;
end $$;

-- 4. Deleting A's account cascades their data and keeps the audit trail.
reset role;
set local request.jwt.claims = ''; -- no caller: rows must be attributed to their owner (A)
insert into public.absences (user_id, date_from, date_to, type)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-05', '2026-10-05', 'sick');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  if exists (select 1 from public.absences where user_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL 4a: user data not deleted';
  end if;
  -- A's trail: profile insert, time_entries insert/update/delete, absences insert,
  -- then the cascade's profile delete and absences delete = 7.
  if (select count(*) from public.audit_log where user_id = '00000000-0000-0000-0000-0000000000a1') <> 7 then
    raise exception 'FAIL 4b: audit trail lost or misattributed on account deletion';
  end if;
end $$;

select 'audit_log: all checks passed' as result;
rollback;
