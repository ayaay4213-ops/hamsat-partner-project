-- Publish a room activity event when the host starts a multiplayer game.
-- The event drives the room ticker and activity history for every room member.
create or replace function public.room_game_start(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_room uuid;
  v_count integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  select host_id, room_id into v_host, v_room
    from public.room_game_sessions
   where id = p_session_id and status = 'lobby'
   for update;

  if v_host is null or v_host <> v_user then
    raise exception 'بدء الجولة متاح لمضيفها فقط';
  end if;

  perform 1 from public.room_members rm
   where rm.room_id = v_room and rm.user_id = v_user
   for key share;
  if not found then
    raise exception 'يجب أن يبقى مضيف الجولة داخل الغرفة لبدئها';
  end if;

  select count(*) into v_count
    from public.room_game_players
   where session_id = p_session_id;

  if v_count < 2 then
    raise exception 'تحتاج الجولة إلى لاعبين اثنين على الأقل';
  end if;

  update public.room_game_sessions
     set status = 'active', started_at = now(), question_started_at = now()
   where id = p_session_id;

  insert into public.room_activity_events(room_id, actor_id, event_type, payload)
  values (v_room, v_user, 'game', jsonb_build_object('message', 'بدأت لعبة جماعية في الغرفة'));

  return jsonb_build_object('started', true, 'players', v_count);
end;
$$;
