-- Quiz results + hidden admin access.
-- NOTE: the real admin password hash is NOT in this file. It was set directly in the database:
--   insert into private.admin_secret (id, password_hash)
--   values (1, extensions.crypt('<NEW_PASSWORD>', extensions.gen_salt('bf', 10)))
--   on conflict (id) do update set password_hash = excluded.password_hash;

create extension if not exists pgcrypto with schema extensions;

-- 1. Results of quiz attempts (public may only INSERT, never read)
create table public.quiz_attempts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  participant_name text not null check (char_length(participant_name) between 1 and 80),
  course text not null check (course ~ '^[a-z0-9-]{1,60}$'),
  quiz text not null check (quiz ~ '^[a-z0-9-]{1,60}$'),
  score int not null,
  total int not null,
  passed boolean not null,
  constraint quiz_attempts_total_range check (total between 1 and 100),
  constraint quiz_attempts_score_range check (score between 0 and total)
);

alter table public.quiz_attempts enable row level security;

revoke all on public.quiz_attempts from anon, authenticated;
grant insert on public.quiz_attempts to anon, authenticated;

create policy "anyone can record a quiz attempt"
  on public.quiz_attempts for insert
  to anon, authenticated
  with check (
    char_length(participant_name) between 1 and 80
    and score between 0 and total
    and total between 1 and 100
  );

-- 2. Private admin objects (not reachable from the API: no grants, RLS on, no policies)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.admin_secret (
  id int primary key check (id = 1),
  password_hash text not null
);
alter table private.admin_secret enable row level security;

create table private.admin_login_failures (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default now()
);
alter table private.admin_login_failures enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;

-- 3. The only way to read results: password-checked, throttled (5 failures / 10 min, global)
create or replace function public.admin_list_attempts(p_password text)
returns jsonb
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
    return jsonb_build_object('status', 'locked');
  end if;

  select password_hash into v_hash from private.admin_secret where id = 1;

  if v_hash is null
     or p_password is null
     or extensions.crypt(p_password, v_hash) <> v_hash then
    delete from private.admin_login_failures where attempted_at < now() - interval '1 day';
    insert into private.admin_login_failures default values;
    return jsonb_build_object('status', 'bad_password');
  end if;

  -- explicit WHERE: PostgREST refuses a bare DELETE
  delete from private.admin_login_failures where id is not null;

  return jsonb_build_object(
    'status', 'ok',
    'attempts', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select a.id, a.created_at, a.participant_name as name, a.course, a.quiz,
               a.score, a.total, a.passed
        from public.quiz_attempts a
        order by a.created_at desc
        limit 1000
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_attempts(text) from public;
grant execute on function public.admin_list_attempts(text) to anon, authenticated;
