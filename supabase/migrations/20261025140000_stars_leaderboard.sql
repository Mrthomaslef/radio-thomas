-- Public stars leaderboard aggregating stars earned on the daily progression path (ch96).
-- Each completed step-<N> in public.quiz_progress.progress->'ch96'->'answers' stores ['A' (1★), 'B' (2★), or 'C' (3★)].

create or replace function public.get_stars_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  with step_rows as (
    select
      qp.pseudo_key,
      btrim(qp.participant_name) as name,
      qp.updated_at,
      case
        when kv.value->>0 = 'C' then 3
        when kv.value->>0 = 'B' then 2
        else 1
      end as stars
    from public.quiz_progress qp
    cross join lateral jsonb_each(
      case
        when jsonb_typeof(qp.progress->'ch96'->'answers') = 'object'
        then qp.progress->'ch96'->'answers'
        else '{}'::jsonb
      end
    ) as kv(key, value)
    where kv.key ~ '^step-[0-9]{1,4}$'
      and jsonb_typeof(kv.value) = 'array'
      and jsonb_array_length(kv.value) > 0
  ),
  totals as (
    select
      pseudo_key,
      max(name) as name,
      sum(stars)::int as stars,
      count(*)::int as steps,
      max(updated_at) as updated_at
    from step_rows
    group by pseudo_key
    having sum(stars) > 0
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', totals.name,
        'points', totals.stars,
        'stars', totals.stars,
        'steps', totals.steps,
        'updatedAt', totals.updated_at
      )
      order by totals.stars desc, totals.steps desc, totals.updated_at asc
    ),
    '[]'::jsonb
  )
  into v_rows
  from totals;

  return v_rows;
end;
$$;

revoke all on function public.get_stars_leaderboard() from public;
grant execute on function public.get_stars_leaderboard() to anon, authenticated;
