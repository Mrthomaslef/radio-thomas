-- Images uploaded from the admin page (iconography questions, pictures inside answers, correction figures).
-- Run once in the Supabase SQL editor (project "thomas-radio"), then run the advisors.
-- The table itself is unreachable from the API (RLS on, no grants, no policies): images are written
-- through a password-checked function and read one at a time, by their random 32-hex id, through
-- get_quiz_image(). Images are never deleted (old question versions may still point to them).

create table public.quiz_images (
  id text primary key check (id ~ '^[a-f0-9]{32}$'),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  data_b64 text not null check (char_length(data_b64) between 100 and 2200000),
  created_at timestamptz not null default now()
);

alter table public.quiz_images enable row level security;
revoke all on public.quiz_images from public, anon, authenticated;

create or replace function public.admin_upload_image(p_password text, p_id text, p_mime text, p_b64 text)
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
  if p_id !~ '^[a-f0-9]{32}$'
     or p_mime not in ('image/png', 'image/jpeg', 'image/webp')
     or p_b64 is null
     or char_length(p_b64) not between 100 and 2200000 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  insert into public.quiz_images (id, mime, data_b64) values (p_id, p_mime, p_b64);
  return jsonb_build_object('status', 'ok', 'id', p_id);
end;
$$;

create or replace function public.get_quiz_image(p_id text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select to_jsonb(r)
  from (
    select mime, data_b64
    from public.quiz_images
    where id = p_id and p_id ~ '^[a-f0-9]{32}$'
  ) r;
$$;

revoke all on function public.admin_upload_image(text, text, text, text) from public;
revoke all on function public.get_quiz_image(text) from public;
grant execute on function public.admin_upload_image(text, text, text, text) to anon, authenticated;
grant execute on function public.get_quiz_image(text) to anon, authenticated;
