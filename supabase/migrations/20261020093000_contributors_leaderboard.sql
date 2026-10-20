-- Contributors leaderboard computed from the database (single source of truth):
--   +1 point per question report (public.quiz_reports, plus legacy reports stored as base64 chunks
--      in quiz_attempts with course 'report-<id>')
--   +10 points per proposed question accepted by the admin (legacy chunk rows 'report-subm-<id>'
--      with a 'subm-accepted' marker). The author pseudo is the "u" field of the encoded payload.
-- Never mixed with get_leaderboard() (quiz points), which ignores every 'report-%' course.

create or replace function public.get_contributors_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_rows jsonb;
begin
  with table_reports as (
    select
      lower(btrim(participant_name)) as pseudo_key,
      (array_agg(btrim(participant_name) order by created_at desc))[1] as display_name,
      count(*)::int as reports,
      0 as submissions,
      max(created_at) as last_at
    from public.quiz_reports
    where char_length(btrim(participant_name)) > 0
      and lower(btrim(participant_name)) <> 'anonyme'
    group by lower(btrim(participant_name))
  ),
  chunk_docs as (
    select
      regexp_replace(course, '-p[0-9]+$', '') as base,
      string_agg(participant_name, '' order by coalesce(substring(course from '-p([0-9]+)$')::int, 0), score) as b64,
      max(created_at) as last_at
    from public.quiz_attempts
    where course like 'report-%'
      and quiz not like 'subm-%'
      and participant_name ~ '^[A-Za-z0-9+/=]+$'
    group by regexp_replace(course, '-p[0-9]+$', '')
  ),
  chunk_authors as (
    -- the payload starts with {"u":"<pseudo>","c":...: decode only the head, cut before the "c" key
    select
      base,
      last_at,
      (
        convert_from(
          substring(head from 1 for position('","c":"'::bytea in head) - 1) || '"}'::bytea,
          'UTF8'
        )::jsonb ->> 'u'
      ) as author
    from (
      select base, last_at, decode(left(b64, 4 * (least(length(b64), 400) / 4)), 'base64') as head
      from chunk_docs
      where b64 like 'eyJ1Ijoi%'
    ) h
    where position('","c":"'::bytea in head) > 0
  ),
  legacy as (
    select
      lower(btrim(a.author)) as pseudo_key,
      btrim(a.author) as display_name,
      case when a.base like 'report-subm-%' then 0 else 1 end as reports,
      case when a.base like 'report-subm-%' then 1 else 0 end as submissions,
      a.last_at
    from chunk_authors a
    where char_length(btrim(a.author)) > 0
      and lower(btrim(a.author)) <> 'anonyme'
      and (
        a.base not like 'report-subm-%'
        or exists (
          select 1 from public.quiz_attempts m
          where m.course = a.base and m.quiz = 'subm-accepted'
        )
      )
  ),
  combined as (
    select pseudo_key, display_name, reports, submissions, last_at from table_reports
    union all
    select pseudo_key, display_name, reports, submissions, last_at from legacy
  ),
  totals as (
    select
      pseudo_key,
      (array_agg(display_name order by last_at desc))[1] as name,
      sum(reports)::int as reports,
      sum(submissions)::int as submissions,
      (sum(reports) + sum(submissions) * 10)::int as points,
      max(last_at) as updated_at
    from combined
    group by pseudo_key
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', t.name,
        'points', t.points,
        'reports', t.reports,
        'submissions', t.submissions,
        'updatedAt', t.updated_at
      )
      order by t.points desc, t.updated_at asc
    ),
    '[]'::jsonb
  )
  into v_rows
  from totals t;

  return v_rows;
end;
$$;

revoke all on function public.get_contributors_leaderboard() from public;
grant execute on function public.get_contributors_leaderboard() to anon, authenticated;
