-- Fast direct RPCs and indexes for the reviewer space (#/correcteur) and image uploads

CREATE INDEX IF NOT EXISTS quiz_attempts_created_at_idx ON public.quiz_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_questions_chapter_pos_idx ON public.quiz_questions (chapter, position);

CREATE OR REPLACE FUNCTION public.reviewer_upload_image(
  p_password text,
  p_id text,
  p_mime text,
  p_b64 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  if p_password is null or lower(trim(p_password)) <> 'cocochin' then
    return jsonb_build_object('status', 'bad_password');
  end if;
  if p_id !~ '^[a-f0-9]{32}$'
     or p_mime not in ('image/png', 'image/jpeg', 'image/webp')
     or p_b64 is null
     or char_length(p_b64) not between 100 and 2200000 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  insert into public.quiz_images (id, mime, data_b64) values (p_id, p_mime, p_b64)
  on conflict (id) do nothing;
  return jsonb_build_object('status', 'ok', 'id', p_id);
end;
$$;

CREATE OR REPLACE FUNCTION public.reviewer_save_question(
  p_password text,
  p_id text,
  p_chapter text,
  p_position int,
  p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  if p_password is null or lower(trim(p_password)) <> 'cocochin' then
    return jsonb_build_object('status', 'bad_password');
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

CREATE OR REPLACE FUNCTION public.reviewer_delete_question(
  p_password text,
  p_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  if p_password is null or lower(trim(p_password)) <> 'cocochin' then
    return jsonb_build_object('status', 'bad_password');
  end if;
  update public.quiz_questions
    set deleted_at = now(), updated_at = now()
    where id = p_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

GRANT EXECUTE ON FUNCTION public.reviewer_upload_image(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reviewer_save_question(text, text, text, int, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reviewer_delete_question(text, text) TO anon, authenticated;
