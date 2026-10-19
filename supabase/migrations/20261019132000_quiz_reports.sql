-- Question feedback / reports sent by learners for the admin dashboard.
-- Run in the Supabase SQL editor (project "thomas-radio"), then run the advisors.
-- Public can only INSERT reports; reading and resolving require the admin password.

create table if not exists public.quiz_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  participant_name text not null check (char_length(participant_name) between 1 and 80),
  chapter text not null check (chapter ~ '^ch[0-9]{1,2}$'),
  question_id text not null check (question_id ~ '^[a-z0-9-]{1,40}$'),
  message text not null check (char_length(message) between 1 and 1000),
  resolved_at timestamptz
);

alter table public.quiz_reports enable row level security;

revoke all on public.quiz_reports from anon, authenticated;
grant insert on public.quiz_reports to anon, authenticated;

create policy "anyone can submit a question report"
  on public.quiz_reports for insert
  to anon, authenticated
  with check (
    char_length(participant_name) between 1 and 80
    and chapter ~ '^ch[0-9]{1,2}$'
    and question_id ~ '^[a-z0-9-]{1,40}$'
    and char_length(message) between 1 and 1000
    and resolved_at is null
  );

create or replace function public.admin_list_reports(p_password text)
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
    'reports', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select id, created_at, participant_name as name, chapter, question_id, message, resolved_at
        from public.quiz_reports
        order by created_at desc
        limit 500
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_resolve_report(p_password text, p_id bigint)
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
  update public.quiz_reports
  set resolved_at = now()
  where id = p_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.admin_list_reports(text) from public;
revoke all on function public.admin_resolve_report(text, bigint) from public;
grant execute on function public.admin_list_reports(text) to anon, authenticated;
grant execute on function public.admin_resolve_report(text, bigint) to anon, authenticated;
