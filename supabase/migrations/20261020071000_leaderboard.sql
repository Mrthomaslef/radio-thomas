-- Public leaderboard aggregating points from completed quizzes (1 point per correct answer).
-- Excludes question reports stored with course like 'report-%'.

create or replace function public.get_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  with chapter_scores as (
    select
      lower(btrim(participant_name)) as pseudo_key,
      (array_agg(btrim(participant_name) order by created_at desc))[1] as display_name,
      quiz,
      max(score)::int as pts,
      1 as qcount,
      max(created_at) as last_at
    from public.quiz_attempts
    where course not like 'report-%'
      and quiz not in ('aleatoire', 'quiz-aleatoire')
      and passed = true
      and score >= 0
    group by lower(btrim(participant_name)), quiz
  ),
  random_scores as (
    select
      lower(btrim(participant_name)) as pseudo_key,
      (array_agg(btrim(participant_name) order by created_at desc))[1] as display_name,
      'aleatoire' as quiz,
      sum(score)::int as pts,
      count(*)::int as qcount,
      max(created_at) as last_at
    from public.quiz_attempts
    where course not like 'report-%'
      and quiz in ('aleatoire', 'quiz-aleatoire')
      and passed = true
      and score >= 0
    group by lower(btrim(participant_name))
  ),
  combined as (
    select * from chapter_scores
    union all
    select * from random_scores
  ),
  totals as (
    select
      pseudo_key,
      (array_agg(display_name order by last_at desc))[1] as name,
      sum(pts)::int as points,
      sum(qcount)::int as quizzes,
      max(last_at) as updated_at
    from combined
    group by pseudo_key
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', totals.name,
        'points', totals.points,
        'quizzes', totals.quizzes,
        'updatedAt', totals.updated_at
      )
      order by totals.points desc, totals.quizzes desc, totals.updated_at asc
    ),
    '[]'::jsonb
  )
  into v_rows
  from totals;

  return v_rows;
end;
$$;

revoke all on function public.get_leaderboard() from public;
grant execute on function public.get_leaderboard() to anon, authenticated;
