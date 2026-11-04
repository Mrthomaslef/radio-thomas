-- Security fix (2026-11-04):
-- * The reviewer password was hard-coded in the (public) repo and in the reviewer_* functions.
--   It is now a bcrypt hash in private.reviewer_secret, checked by private.check_reviewer, with
--   the same lockout as the admin (5 wrong tries -> 10 min), in its own failures table.
-- * The Gemini API key was stored in a publicly readable quiz_questions row ('cfg-ai-key').
--   It now lives in private.ai_config and is only returned to a valid admin or reviewer.
--
-- Secrets are NOT in this file. Set them in the Supabase SQL editor:
--   insert into private.reviewer_secret (id, password_hash)
--   values (1, extensions.crypt(lower('<NEW_PASSWORD>'), extensions.gen_salt('bf', 10)))
--   on conflict (id) do update set password_hash = excluded.password_hash;
--   insert into private.ai_config (id, gemini_api_key) values (1, '<KEY>')
--   on conflict (id) do update set gemini_api_key = excluded.gemini_api_key;

create table if not exists private.reviewer_secret (
  id int primary key check (id = 1),
  password_hash text not null
);
alter table private.reviewer_secret enable row level security;

create table if not exists private.reviewer_login_failures (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default now()
);
alter table private.reviewer_login_failures enable row level security;

create table if not exists private.ai_config (
  id int primary key check (id = 1),
  gemini_api_key text not null
);
alter table private.ai_config enable row level security;

revoke all on private.reviewer_secret, private.reviewer_login_failures, private.ai_config from public, anon, authenticated;

create or replace function private.check_reviewer(p_password text)
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
  from private.reviewer_login_failures
  where attempted_at > now() - interval '10 minutes';

  if v_failures >= 5 then
    return 'locked';
  end if;

  select password_hash into v_hash from private.reviewer_secret where id = 1;

  if v_hash is null
     or p_password is null
     or extensions.crypt(lower(trim(p_password)), v_hash) <> v_hash then
    delete from private.reviewer_login_failures where attempted_at < now() - interval '1 day';
    insert into private.reviewer_login_failures default values;
    return 'bad_password';
  end if;

  delete from private.reviewer_login_failures where id is not null;
  return 'ok';
end;
$$;
revoke all on function private.check_reviewer(text) from public, anon, authenticated;

-- Login check for the reviewer space (no data returned).
create or replace function public.reviewer_login(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object('status', private.check_reviewer(p_password));
end;
$$;

create or replace function public.reviewer_upload_image(p_password text, p_id text, p_mime text, p_b64 text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_reviewer(p_password);
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  if p_id !~ '^[a-f0-9]{32}$'
     or p_mime not in ('image/png', 'image/jpeg', 'image/webp')
     or p_b64 is null
     or char_length(p_b64) not between 100 and 2200000 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  insert into public.quiz_images (id, mime, data_b64) values (p_id, p_mime, p_b64)
  on conflict (id) do update set mime = excluded.mime, data_b64 = excluded.data_b64;
  return jsonb_build_object('status', 'ok', 'id', p_id);
end;
$$;

create or replace function public.reviewer_save_question(p_password text, p_id text, p_chapter text, p_position int, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_reviewer(p_password);
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
        deleted_at = null;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.reviewer_delete_question(p_password text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_reviewer(p_password);
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

-- Gemini key for the AI question generator: only for a valid admin or reviewer password.
create or replace function public.get_ai_key(p_password text, p_reviewer boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_key text;
begin
  v_status := case when p_reviewer then private.check_reviewer(p_password) else private.check_admin(p_password) end;
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  select gemini_api_key into v_key from private.ai_config where id = 1;
  return jsonb_build_object('status', 'ok', 'key', v_key);
end;
$$;

revoke all on function public.reviewer_login(text) from public;
revoke all on function public.reviewer_upload_image(text, text, text, text) from public;
revoke all on function public.reviewer_save_question(text, text, text, int, jsonb) from public;
revoke all on function public.reviewer_delete_question(text, text) from public;
revoke all on function public.get_ai_key(text, boolean) from public;
grant execute on function public.reviewer_login(text) to anon, authenticated;
grant execute on function public.reviewer_upload_image(text, text, text, text) to anon, authenticated;
grant execute on function public.reviewer_save_question(text, text, text, int, jsonb) to anon, authenticated;
grant execute on function public.reviewer_delete_question(text, text) to anon, authenticated;
grant execute on function public.get_ai_key(text, boolean) to anon, authenticated;
