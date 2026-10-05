-- Replace ADMIN_EMAIL_HERE with the administrator account email, then run this
-- script in the Supabase SQL Editor.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.family_state (
  id integer primary key check (id = 1),
  children jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  version bigint not null default 0
);

insert into public.family_state (id, children, tasks, version)
values (1, '[]'::jsonb, '[]'::jsonb, 0)
on conflict (id) do nothing;

alter table public.family_state enable row level security;

drop policy if exists "Family state is readable" on public.family_state;
create policy "Family state is readable"
  on public.family_state for select
  to anon, authenticated
  using (id = 1);

drop policy if exists "Only the configured admin can update family state" on public.family_state;
create policy "Only the configured admin can update family state"
  on public.family_state for update
  to authenticated
  using (
    id = 1
    and lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL_HERE')
  )
  with check (
    id = 1
    and lower(auth.jwt() ->> 'email') = lower('ADMIN_EMAIL_HERE')
  );

grant select on public.family_state to anon, authenticated;
grant update on public.family_state to authenticated;
revoke insert, delete on public.family_state from anon, authenticated;

create table if not exists public.child_credentials (
  child_id text primary key,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

alter table public.child_credentials enable row level security;
revoke all on public.child_credentials from anon, authenticated;

create table if not exists public.child_sessions (
  token_hash bytea primary key,
  child_id text not null,
  expires_at timestamptz not null
);

alter table public.child_sessions enable row level security;
revoke all on public.child_sessions from anon, authenticated;

create or replace function public.admin_set_child_pin(
  p_child_id text,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null
     or coalesce(lower(auth.jwt() ->> 'email'), '') <> lower('ADMIN_EMAIL_HERE') then
    raise exception 'Only the configured administrator can change child PINs.';
  end if;
  if p_child_id is null or p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'A child ID and a four-digit PIN are required.';
  end if;

  insert into public.child_credentials (child_id, pin_hash, failed_attempts, locked_until)
  values (p_child_id, extensions.crypt(p_pin, extensions.gen_salt('bf')), 0, null)
  on conflict (child_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null;

  delete from public.child_sessions where child_id = p_child_id;
  return true;
end;
$$;

create or replace function public.admin_delete_child_pin(p_child_id text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null
     or coalesce(lower(auth.jwt() ->> 'email'), '') <> lower('ADMIN_EMAIL_HERE') then
    raise exception 'Only the configured administrator can delete child PINs.';
  end if;
  delete from public.child_sessions where child_id = p_child_id;
  delete from public.child_credentials where child_id = p_child_id;
  return true;
end;
$$;

create or replace function public.verify_child_pin(p_child_id text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pin_hash text;
  v_failed_attempts integer;
  v_locked_until timestamptz;
  v_token text;
begin
  if p_child_id is null or p_pin is null
     or p_pin !~ '^[0-9]{4}$'
     or not exists (
       select 1
         from public.family_state as family,
              lateral jsonb_array_elements(family.children) as children(child)
        where family.id = 1
          and child ->> 'id' = p_child_id
     ) then
    return null;
  end if;

  select pin_hash, failed_attempts, locked_until
    into v_pin_hash, v_failed_attempts, v_locked_until
    from public.child_credentials
   where child_id = p_child_id
   for update;
  if not found or v_locked_until > now() then
    return null;
  end if;

  if extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    update public.child_credentials
       set failed_attempts = v_failed_attempts + 1,
           locked_until = case
             when v_failed_attempts + 1 >= 5 then now() + interval '5 minutes'
             else null
           end
     where child_id = p_child_id;
    return null;
  end if;

  update public.child_credentials
     set failed_attempts = 0, locked_until = null
   where child_id = p_child_id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.child_sessions (token_hash, child_id, expires_at)
  values (extensions.digest(v_token, 'sha256'), p_child_id, now() + interval '8 hours');
  delete from public.child_sessions where expires_at <= now();
  return v_token;
end;
$$;

create or replace function public.change_child_pin(
  p_child_id text,
  p_child_token text,
  p_new_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_child_id is null or p_child_token is null
     or p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    raise exception 'A valid session and a four-digit PIN are required.';
  end if;
  if not exists (
    select 1
      from public.child_sessions
     where child_id = p_child_id
       and token_hash = extensions.digest(p_child_token, 'sha256')
       and expires_at > now()
  ) then
    raise exception 'The child session has expired. Enter the current PIN again.';
  end if;

  update public.child_credentials
     set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
         failed_attempts = 0,
         locked_until = null
   where child_id = p_child_id;
  if not found then
    raise exception 'The child PIN is not configured.';
  end if;
  delete from public.child_sessions where child_id = p_child_id;
  return true;
end;
$$;

create or replace function public.lock_child_session(p_child_id text, p_child_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_child_id is null or p_child_token is null then
    raise exception 'A child and session token are required.';
  end if;
  delete from public.child_sessions
   where child_id = p_child_id
     and token_hash = extensions.digest(p_child_token, 'sha256');
  if not found then
    raise exception 'The child session has expired.';
  end if;
  return true;
end;
$$;

create table if not exists public.task_completions (
  child_id text not null,
  task_id text not null,
  completion_date date not null,
  earned_stars integer not null check (earned_stars between 0 and 99),
  primary key (child_id, task_id, completion_date)
);

alter table public.task_completions enable row level security;

drop policy if exists "Completions are readable" on public.task_completions;
create policy "Completions are readable"
  on public.task_completions for select
  to anon, authenticated
  using (true);

grant select on public.task_completions to anon, authenticated;
revoke insert, update, delete on public.task_completions from anon, authenticated;

drop function if exists public.set_task_completion(text, text, date, boolean);

create or replace function public.set_task_completion(
  p_child_id text,
  p_task_id text,
  p_date date,
  p_complete boolean,
  p_child_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task jsonb;
  v_stars integer;
  v_repeat_type text;
  v_month_day integer;
  v_last_day integer;
begin
  if p_child_id is null or p_task_id is null or p_date is null
     or p_complete is null or p_child_token is null then
    raise exception 'A child, task, date, completion state, and session token are required.';
  end if;

  if not exists (
    select 1
      from public.child_sessions
     where child_id = p_child_id
       and token_hash = extensions.digest(p_child_token, 'sha256')
       and expires_at > now()
  ) then
    raise exception 'The child session has expired. Enter the PIN again.';
  end if;

  select task
    into v_task
    from public.family_state as family,
         lateral jsonb_array_elements(family.tasks) as tasks(task)
   where family.id = 1
     and task ->> 'id' = p_task_id
     and task ->> 'childId' = p_child_id;

  if v_task is null then
    raise exception 'The task is not assigned to this child.';
  end if;

  v_repeat_type := coalesce(v_task ->> 'repeatType', 'daily');
  if v_repeat_type = 'weekly' then
    if jsonb_typeof(v_task -> 'weekdays') <> 'array'
       or not exists (
         select 1
           from jsonb_array_elements_text(v_task -> 'weekdays') as weekdays(weekday)
          where weekday::integer = extract(dow from p_date)::integer
       ) then
      raise exception 'The task is not scheduled for this weekday.';
    end if;
  elsif v_repeat_type = 'monthly' then
    v_month_day := (v_task ->> 'monthDay')::integer;
    if v_month_day < 1 or v_month_day > 31 then
      raise exception 'The monthly schedule is invalid.';
    end if;
    v_last_day := extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::integer;
    if extract(day from p_date)::integer <> least(v_month_day, v_last_day) then
      raise exception 'The task is not scheduled for this date.';
    end if;
  elsif v_repeat_type <> 'daily' then
    raise exception 'The repeat schedule is invalid.';
  end if;

  v_stars := coalesce((v_task ->> 'stars')::integer, 1);
  if v_stars < 1 or v_stars > 99 then
    raise exception 'The task reward is invalid.';
  end if;

  if p_complete then
    insert into public.task_completions (child_id, task_id, completion_date, earned_stars)
    values (p_child_id, p_task_id, p_date, v_stars)
    on conflict (child_id, task_id, completion_date)
    do update set earned_stars = excluded.earned_stars;
  else
    delete from public.task_completions
     where child_id = p_child_id
       and task_id = p_task_id
       and completion_date = p_date;
  end if;

  return jsonb_build_object('complete', p_complete, 'stars', v_stars);
end;
$$;

revoke all on function public.admin_set_child_pin(text, text) from public;
revoke all on function public.admin_delete_child_pin(text) from public;
revoke all on function public.verify_child_pin(text, text) from public;
revoke all on function public.change_child_pin(text, text, text) from public;
revoke all on function public.lock_child_session(text, text) from public;
revoke all on function public.set_task_completion(text, text, date, boolean, text) from public;
grant execute on function public.admin_set_child_pin(text, text) to authenticated;
grant execute on function public.admin_delete_child_pin(text) to authenticated;
grant execute on function public.verify_child_pin(text, text) to anon, authenticated;
grant execute on function public.change_child_pin(text, text, text) to anon, authenticated;
grant execute on function public.lock_child_session(text, text) to anon, authenticated;
grant execute on function public.set_task_completion(text, text, date, boolean, text) to anon, authenticated;
