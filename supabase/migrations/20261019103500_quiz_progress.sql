-- Per-pseudo quiz progress synced across devices.
-- Run once in the Supabase SQL editor (project "thomas-radio"), then run the advisors.
-- The table itself has no direct grants to anon/authenticated so pseudos cannot be listed;
-- access goes only through get_quiz_progress(p_name) and save_quiz_progress(p_name, p_progress).

create table if not exists public.quiz_progress (
  pseudo_key text primary key check (char_length(pseudo_key) between 1 and 80),
  participant_name text not null check (char_length(participant_name) between 1 and 80),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object' and octet_length(progress::text) < 50000),
  updated_at timestamptz not null default now()
);

alter table public.quiz_progress enable row level security;
revoke all on public.quiz_progress from public, anon, authenticated;

create or replace function public.get_quiz_progress(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_key text := lower(btrim(coalesce(p_name, '')));
  v_progress jsonb;
begin
  if char_length(v_key) not between 1 and 80 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select progress into v_progress
  from public.quiz_progress
  where pseudo_key = v_key;

  return jsonb_build_object(
    'status', 'ok',
    'progress', coalesce(v_progress, '{}'::jsonb)
  );
end;
$$;

create or replace function public.save_quiz_progress(p_name text, p_progress jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean text := btrim(coalesce(p_name, ''));
  v_key text := lower(v_clean);
begin
  if char_length(v_clean) not between 1 and 80
     or p_progress is null
     or jsonb_typeof(p_progress) <> 'object'
     or octet_length(p_progress::text) >= 50000 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  insert into public.quiz_progress as qp (pseudo_key, participant_name, progress, updated_at)
  values (v_key, v_clean, p_progress, now())
  on conflict (pseudo_key) do update
    set participant_name = excluded.participant_name,
        progress = qp.progress || excluded.progress,
        updated_at = now();

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.get_quiz_progress(text) from public;
revoke all on function public.save_quiz_progress(text, jsonb) from public;
grant execute on function public.get_quiz_progress(text) to anon, authenticated;
grant execute on function public.save_quiz_progress(text, jsonb) to anon, authenticated;
