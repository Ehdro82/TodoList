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

create table if not exists public.star_deductions (
  id uuid primary key default extensions.gen_random_uuid(),
  child_id text not null,
  stars integer not null check (stars > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  adjustment_type text not null default 'deduction',
  created_at timestamptz not null default now(),
  deduction_date date not null default (now() at time zone 'Asia/Seoul')::date,
  cancelled_at timestamptz
);

alter table public.star_deductions
  add column if not exists deduction_date date,
  add column if not exists adjustment_type text not null default 'deduction',
  add column if not exists cancelled_at timestamptz;

alter table public.star_deductions
  drop constraint if exists star_deductions_adjustment_type_check;
alter table public.star_deductions
  add constraint star_deductions_adjustment_type_check
  check (adjustment_type in ('deduction', 'grant'));

update public.star_deductions
   set deduction_date = (created_at at time zone 'Asia/Seoul')::date
 where deduction_date is null;

alter table public.star_deductions
  alter column deduction_date set default (now() at time zone 'Asia/Seoul')::date,
  alter column deduction_date set not null;

create index if not exists star_deductions_child_created_idx
  on public.star_deductions (child_id, created_at desc);

alter table public.star_deductions enable row level security;

drop policy if exists "Star deductions are readable" on public.star_deductions;
create policy "Star deductions are readable"
  on public.star_deductions for select
  to authenticated
  using (
    coalesce(lower(auth.jwt() ->> 'email'), '') = lower('ADMIN_EMAIL_HERE')
  );

revoke all on public.star_deductions from public, anon, authenticated;
grant select on public.star_deductions to authenticated;

create or replace function public.get_child_star_deduction_totals()
returns table (child_id text, stars bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select deductions.child_id,
         sum(case when deductions.adjustment_type = 'deduction' then deductions.stars else -deductions.stars end)
    from public.star_deductions as deductions
   where deductions.cancelled_at is null
   group by deductions.child_id;
$$;

revoke all on function public.get_child_star_deduction_totals() from public;
grant execute on function public.get_child_star_deduction_totals() to anon, authenticated;

create or replace function public.admin_deduct_child_stars(
  p_child_id text,
  p_stars integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_children jsonb;
  v_earned_stars bigint;
  v_deducted_stars bigint;
  v_balance bigint;
  v_deduction public.star_deductions;
begin
  if auth.uid() is null
     or coalesce(lower(auth.jwt() ->> 'email'), '') <> lower('ADMIN_EMAIL_HERE') then
    raise exception 'Only the configured administrator can deduct child stars.';
  end if;
  if p_child_id is null or p_stars is null or p_stars < 1
     or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'A child, positive star amount, and reason (up to 500 characters) are required.';
  end if;

  select children
    into v_children
    from public.family_state
   where id = 1
   for update;
  if not found or not exists (
    select 1
      from jsonb_array_elements(v_children) as children(child)
     where child ->> 'id' = p_child_id
  ) then
    raise exception 'The selected child does not exist.';
  end if;

  select coalesce(sum(earned_stars), 0)
    into v_earned_stars
    from public.task_completions
   where child_id = p_child_id;
  select coalesce(sum(case when adjustment_type = 'deduction' then stars else -stars end), 0)
    into v_deducted_stars
    from public.star_deductions
   where child_id = p_child_id
   and cancelled_at is null;
  v_balance := greatest(0, v_earned_stars - v_deducted_stars);
  if p_stars > v_balance then
    raise exception 'The deduction exceeds the child''s current star balance (%).', v_balance;
  end if;

  insert into public.star_deductions (child_id, stars, reason)
  values (p_child_id, p_stars, btrim(p_reason))
  returning * into v_deduction;
  return to_jsonb(v_deduction);
end;
$$;

create or replace function public.admin_adjust_child_stars(
  p_child_id text,
  p_stars integer,
  p_reason text,
  p_adjustment_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_children jsonb;
  v_earned_stars bigint;
  v_net_adjustment bigint;
  v_balance bigint;
  v_adjustment public.star_deductions;
begin
  if auth.uid() is null
     or coalesce(lower(auth.jwt() ->> 'email'), '') <> lower('ADMIN_EMAIL_HERE') then
    raise exception 'Only the configured administrator can manage child stars.';
  end if;
  if p_child_id is null or p_stars is null or p_stars not between 1 and 99
     or p_adjustment_type is null or p_adjustment_type not in ('deduction', 'grant')
     or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'A child, 1-99 stars, a valid adjustment type, and a reason (up to 500 characters) are required.';
  end if;

  select children
    into v_children
    from public.family_state
   where id = 1
   for update;
  if not found or not exists (
    select 1
      from jsonb_array_elements(v_children) as children(child)
     where child ->> 'id' = p_child_id
  ) then
    raise exception 'The selected child does not exist.';
  end if;

  if p_adjustment_type = 'deduction' then
    select coalesce(sum(earned_stars), 0)
      into v_earned_stars
      from public.task_completions
     where child_id = p_child_id;
    select coalesce(sum(case when adjustment_type = 'deduction' then stars else -stars end), 0)
      into v_net_adjustment
      from public.star_deductions
     where child_id = p_child_id
       and cancelled_at is null;
    v_balance := greatest(0, v_earned_stars - v_net_adjustment);
    if p_stars > v_balance then
      raise exception 'The deduction exceeds the child''s current star balance (%).', v_balance;
    end if;
  end if;

  insert into public.star_deductions (child_id, stars, reason, adjustment_type)
  values (p_child_id, p_stars, btrim(p_reason), p_adjustment_type)
  returning * into v_adjustment;
  return to_jsonb(v_adjustment);
end;
$$;

create or replace function public.admin_cancel_child_star_deduction(
  p_deduction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deduction public.star_deductions;
begin
  if auth.uid() is null
     or coalesce(lower(auth.jwt() ->> 'email'), '') <> lower('ADMIN_EMAIL_HERE') then
    raise exception 'Only the configured administrator can cancel child star deductions.';
  end if;
  if p_deduction_id is null then
    raise exception 'A deduction ID is required.';
  end if;

  perform 1
    from public.family_state
   where id = 1
   for update;
  if not found then
    raise exception 'Family state is not configured.';
  end if;

  select *
    into v_deduction
    from public.star_deductions
   where id = p_deduction_id
   for update;
  if not found then
    raise exception 'The selected star deduction does not exist.';
  end if;
  if v_deduction.cancelled_at is not null then
    raise exception 'The selected star deduction has already been cancelled.';
  end if;

  update public.star_deductions
     set cancelled_at = now()
   where id = p_deduction_id
  returning * into v_deduction;
  return to_jsonb(v_deduction);
end;
$$;

create or replace function public.get_child_star_adjustment_history(
  p_child_id text,
  p_start_date date,
  p_end_date date
)
returns table (
  stars integer,
  adjustment_type text,
  adjustment_date date,
  cancelled_at timestamptz,
  reason text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_child_id is null or p_start_date is null or p_end_date is null
     or p_end_date <= p_start_date or p_end_date - p_start_date > 32 then
    raise exception 'A child and a valid date range of at most 32 days are required.';
  end if;
  if not exists (
    select 1
      from public.family_state
      cross join lateral jsonb_array_elements(children) as child(value)
     where id = 1 and child.value ->> 'id' = p_child_id
  ) then
    raise exception 'The selected child does not exist.';
  end if;

  return query
  select adjustments.stars,
         adjustments.adjustment_type,
         adjustments.deduction_date,
         adjustments.cancelled_at,
         adjustments.reason
    from public.star_deductions as adjustments
   where adjustments.child_id = p_child_id
     and adjustments.deduction_date >= p_start_date
     and adjustments.deduction_date < p_end_date
   order by adjustments.deduction_date desc, adjustments.created_at desc;
end;
$$;

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
revoke all on function public.admin_deduct_child_stars(text, integer, text) from public;
revoke all on function public.admin_adjust_child_stars(text, integer, text, text) from public;
revoke all on function public.admin_cancel_child_star_deduction(uuid) from public;
revoke all on function public.get_child_star_adjustment_history(text, date, date) from public;
grant execute on function public.admin_set_child_pin(text, text) to authenticated;
grant execute on function public.admin_delete_child_pin(text) to authenticated;
grant execute on function public.verify_child_pin(text, text) to anon, authenticated;
grant execute on function public.change_child_pin(text, text, text) to anon, authenticated;
grant execute on function public.lock_child_session(text, text) to anon, authenticated;
grant execute on function public.set_task_completion(text, text, date, boolean, text) to anon, authenticated;
grant execute on function public.admin_deduct_child_stars(text, integer, text) to authenticated;
grant execute on function public.admin_adjust_child_stars(text, integer, text, text) to authenticated;
grant execute on function public.admin_cancel_child_star_deduction(uuid) to authenticated;
grant execute on function public.get_child_star_adjustment_history(text, date, date) to anon, authenticated;

create table if not exists public.book_reading_records (
  id uuid primary key default extensions.gen_random_uuid(),
  child_id text not null,
  reading_date date not null,
  title text not null check (char_length(title) between 1 and 200),
  page_from integer not null check (page_from between 1 and 100000),
  page_to integer not null check (page_to between page_from and 100000),
  created_at timestamptz not null default now()
);

create index if not exists book_reading_records_child_date_idx
  on public.book_reading_records (child_id, reading_date);

alter table public.book_reading_records enable row level security;

drop policy if exists "Book reading records are readable" on public.book_reading_records;
create policy "Book reading records are readable"
  on public.book_reading_records for select
  to anon, authenticated
  using (true);

grant select on public.book_reading_records to anon, authenticated;
revoke insert, update, delete on public.book_reading_records from anon, authenticated;

create or replace function public.save_book_reading(
  p_id uuid,
  p_child_id text,
  p_reading_date date,
  p_title text,
  p_page_from integer,
  p_page_to integer,
  p_child_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.book_reading_records;
begin
  if p_child_id is null or p_reading_date is null or p_title is null
     or p_page_from is null or p_page_to is null or p_child_token is null then
    raise exception 'A child, date, book title, page range, and session token are required.';
  end if;
  if char_length(btrim(p_title)) not between 1 and 200
     or p_page_from < 1 or p_page_to < p_page_from or p_page_to > 100000 then
    raise exception 'Enter a book title (up to 200 characters) and a valid page range.';
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
  if not exists (
    select 1
      from public.family_state as family,
           lateral jsonb_array_elements(family.children) as children(child)
     where family.id = 1
       and child ->> 'id' = p_child_id
  ) then
    raise exception 'The selected child does not exist.';
  end if;

  if p_id is null then
    insert into public.book_reading_records
      (child_id, reading_date, title, page_from, page_to)
    values
      (p_child_id, p_reading_date, btrim(p_title), p_page_from, p_page_to)
    returning * into v_record;
  else
    update public.book_reading_records
       set reading_date = p_reading_date,
           title = btrim(p_title),
           page_from = p_page_from,
           page_to = p_page_to
     where id = p_id
       and child_id = p_child_id
    returning * into v_record;
    if not found then
      raise exception 'The reading record was not found for this child.';
    end if;
  end if;
  return to_jsonb(v_record);
end;
$$;

create or replace function public.delete_book_reading(
  p_id uuid,
  p_child_id text,
  p_child_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_id is null or p_child_id is null or p_child_token is null then
    raise exception 'A reading record, child, and session token are required.';
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

  delete from public.book_reading_records
   where id = p_id
     and child_id = p_child_id;
  if not found then
    raise exception 'The reading record was not found for this child.';
  end if;
  return true;
end;
$$;

revoke all on function public.save_book_reading(uuid, text, date, text, integer, integer, text) from public;
revoke all on function public.delete_book_reading(uuid, text, text) from public;
grant execute on function public.save_book_reading(uuid, text, date, text, integer, integer, text) to anon, authenticated;
grant execute on function public.delete_book_reading(uuid, text, text) to anon, authenticated;
