create or replace function public.create_owned_room(p_title text, p_topic text default 'عام'::text, p_description text default ''::text, p_cover_url text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_topic text := coalesce(nullif(btrim(p_topic), ''), 'عام');
  v_description text := coalesce(p_description, '');
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 50 then raise exception 'عنوان الغرفة يجب أن يكون بين 3 و50 حرفاً'; end if;
  if char_length(v_topic) > 20 or char_length(v_description) > 160 then raise exception 'الموضوع أو الوصف أطول من الحد المسموح'; end if;
  insert into public.rooms(owner_id, title, topic, description, cover_url, seat_limit)
  values (v_user, v_title, v_topic, v_description, nullif(btrim(p_cover_url), ''), 10)
  returning * into v_room;
  insert into public.room_members(room_id, user_id) values (v_room.id, v_user) on conflict (room_id, user_id) do nothing;
  insert into public.room_seats(room_id, seat_no, user_id) values (v_room.id, 1, v_user);
  return to_jsonb(v_room);
end;
$function$;
