-- Return `exists: true` from get_quiz_progress(p_name) whenever the pseudo already has a row
-- in public.quiz_progress or public.quiz_attempts.

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
  v_exists boolean := false;
begin
  if char_length(v_key) not between 1 and 80 then
    return jsonb_build_object('status', 'bad_request', 'exists', false);
  end if;

  select progress into v_progress
  from public.quiz_progress
  where pseudo_key = v_key;

  if v_progress is not null and v_progress <> '{}'::jsonb then
    v_exists := true;
  else
    select exists(
      select 1
      from public.quiz_attempts
      where lower(btrim(participant_name)) = v_key
    ) into v_exists;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'exists', coalesce(v_exists, false),
    'progress', coalesce(v_progress, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_quiz_progress(text) from public;
grant execute on function public.get_quiz_progress(text) to anon, authenticated;
