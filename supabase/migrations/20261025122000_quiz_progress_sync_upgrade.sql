-- Increase progress JSONB size limit from 50 KB to 500 KB so full multi-chapter + 108-step daily path
-- progress never hits the size cap when syncing across devices.

alter table public.quiz_progress
  drop constraint if exists quiz_progress_progress_check;

alter table public.quiz_progress
  add constraint quiz_progress_progress_check
  check (jsonb_typeof(progress) = 'object' and octet_length(progress::text) < 500000);

create or replace function public.save_quiz_progress(p_name text, p_progress jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean text := btrim(coalesce(p_name, ''));
  v_key text := lower(v_clean);
  v_saved jsonb;
begin
  if char_length(v_clean) not between 1 and 80
     or p_progress is null
     or jsonb_typeof(p_progress) <> 'object'
     or octet_length(p_progress::text) >= 500000 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  insert into public.quiz_progress as qp (pseudo_key, participant_name, progress, updated_at)
  values (v_key, v_clean, p_progress, now())
  on conflict (pseudo_key) do update
    set participant_name = excluded.participant_name,
        progress = qp.progress || excluded.progress,
        updated_at = now()
  returning progress into v_saved;

  return jsonb_build_object('status', 'ok', 'progress', coalesce(v_saved, p_progress));
end;
$$;

revoke all on function public.save_quiz_progress(text, jsonb) from public;
grant execute on function public.save_quiz_progress(text, jsonb) to anon, authenticated;
