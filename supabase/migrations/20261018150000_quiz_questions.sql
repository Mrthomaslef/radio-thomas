-- Editable quiz questions + admin functions.
-- Run this file once in the Supabase SQL editor (project "thomas-radio"), then run the advisors.
-- Same security model as 20261018120000_quiz_attempts_and_admin.sql: the public can only READ
-- live questions; every write goes through a function that checks the admin password in Postgres
-- (throttled: 5 failures / 10 minutes, global). Deleting is soft (deleted_at), never a real DELETE,
-- and every change keeps the previous version in private.quiz_question_versions.

-- 1. Questions (public read-only)
create table public.quiz_questions (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  chapter text not null check (chapter ~ '^ch[0-9]{1,2}$'),
  position int not null default 0,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 50000),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.quiz_questions enable row level security;

revoke all on public.quiz_questions from anon, authenticated;
grant select on public.quiz_questions to anon, authenticated;

create policy "anyone can read live questions"
  on public.quiz_questions for select
  to anon, authenticated
  using (deleted_at is null);

-- 2. History of previous versions (private: no grants, RLS on, no policies)
create table private.quiz_question_versions (
  id bigint generated always as identity primary key,
  question_id text not null,
  saved_at timestamptz not null default now(),
  data jsonb not null,
  deleted_at timestamptz
);
alter table private.quiz_question_versions enable row level security;
revoke all on private.quiz_question_versions from public, anon, authenticated;

create or replace function private.keep_question_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.data is distinct from new.data or old.deleted_at is distinct from new.deleted_at then
    insert into private.quiz_question_versions (question_id, data, deleted_at)
    values (old.id, old.data, old.deleted_at);
  end if;
  return new;
end;
$$;

create trigger quiz_questions_keep_version
  before update on public.quiz_questions
  for each row execute function private.keep_question_version();

-- 3. Password check shared by all admin functions (same rules as admin_list_attempts)
create or replace function private.check_admin(p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_failures int;
begin
  select count(*) into v_failures
  from private.admin_login_failures
  where attempted_at > now() - interval '10 minutes';

  if v_failures >= 5 then
    return 'locked';
  end if;

  select password_hash into v_hash from private.admin_secret where id = 1;

  if v_hash is null
     or p_password is null
     or extensions.crypt(p_password, v_hash) <> v_hash then
    delete from private.admin_login_failures where attempted_at < now() - interval '1 day';
    insert into private.admin_login_failures default values;
    return 'bad_password';
  end if;

  delete from private.admin_login_failures where id is not null;
  return 'ok';
end;
$$;
revoke all on function private.check_admin(text) from public, anon, authenticated;

-- 4. Admin functions (callable by the API with the publishable key, but useless without the password)
create or replace function public.admin_list_questions(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_admin(p_password);
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'questions', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.chapter, r.position)
      from (
        select id, chapter, position, data, updated_at, deleted_at
        from public.quiz_questions
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_question(
  p_password text, p_id text, p_chapter text, p_position int, p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_admin(p_password);
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  insert into public.quiz_questions as q (id, chapter, position, data)
  values (p_id, p_chapter, coalesce(p_position, 0), p_data)
  on conflict (id) do update
    set chapter = excluded.chapter,
        position = excluded.position,
        data = excluded.data,
        updated_at = now(),
        deleted_at = null;  -- saving also restores a deleted question
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.admin_delete_question(p_password text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_admin(p_password);
  v_count int;
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  update public.quiz_questions
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('status', case when v_count = 1 then 'ok' else 'not_found' end);
end;
$$;

-- Import never overwrites: existing (even edited or deleted) questions are left as they are.
create or replace function public.admin_import_questions(p_password text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_admin(p_password);
  v_count int;
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('status', 'bad_request');
  end if;
  with ins as (
    insert into public.quiz_questions (id, chapter, position, data)
    select e->>'id', e->>'chapter', coalesce((e->>'position')::int, 0), e->'data'
    from jsonb_array_elements(p_items) e
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return jsonb_build_object('status', 'ok', 'imported', v_count);
end;
$$;

revoke all on function public.admin_list_questions(text) from public;
revoke all on function public.admin_save_question(text, text, text, int, jsonb) from public;
revoke all on function public.admin_delete_question(text, text) from public;
revoke all on function public.admin_import_questions(text, jsonb) from public;
grant execute on function public.admin_list_questions(text) to anon, authenticated;
grant execute on function public.admin_save_question(text, text, text, int, jsonb) to anon, authenticated;
grant execute on function public.admin_delete_question(text, text) to anon, authenticated;
grant execute on function public.admin_import_questions(text, jsonb) to anon, authenticated;
