-- Require the room owner/host to remain an active room member
-- before creating, starting, advancing, or cancelling a room game.
-- This migration is intentionally staged on the development branch only.

create or replace function public.room_game_create(p_room_id uuid, p_game_id text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_owner uuid;
  v_config jsonb;
  v_public_questions jsonb;
  v_answer_keys jsonb;
  v_session uuid;
  v_count integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  select owner_id into v_owner
    from public.rooms
   where id=p_room_id
   for update;

  if v_owner is null or v_owner<>v_user then
    raise exception 'إنشاء الجولة متاح لمضيف الغرفة فقط';
  end if;

  perform 1 from public.room_members rm
   where rm.room_id=p_room_id and rm.user_id=v_user
   for key share;
  if not found then
    raise exception 'يجب أن يكون مضيف الغرفة عضواً فيها لإنشاء الجولة';
  end if;

  if exists(select 1 from public.room_game_sessions where room_id=p_room_id and status in ('lobby','active')) then
    raise exception 'توجد جولة جماعية مفتوحة في هذه الغرفة بالفعل';
  end if;

  select config into v_config
    from public.games
   where id=p_game_id and active=true and game_type in ('quiz','trivia');

  if not found then raise exception 'اللعبة غير متاحة'; end if;
  if jsonb_typeof(v_config->'questions') is distinct from 'array' then
    raise exception 'اللعبة لا تحتوي أسئلة صالحة';
  end if;

  select count(*) into v_count
    from jsonb_array_elements(v_config->'questions') q(value)
   where jsonb_typeof(q.value->'question')='string'
     and length(btrim(coalesce(q.value->>'question','')))>0
     and case when jsonb_typeof(q.value->'options')='array'
       then jsonb_array_length(q.value->'options')>=2
         and not exists(
           select 1 from jsonb_array_elements(q.value->'options') o(value)
            where jsonb_typeof(o.value) is distinct from 'string'
         )
       else false end;

  if v_count<1 or v_count>30 then
    raise exception 'يجب أن تحتوي الجولة من سؤال إلى 30 سؤالاً صالحاً';
  end if;

  select
    jsonb_agg(
      jsonb_build_object('question',q.value->>'question','options',q.value->'options')
      order by q.ordinality
    ),
    jsonb_agg(
      jsonb_build_object(
        'answer_index',
        case
          when jsonb_typeof(q.value->'answer')='number' then (q.value->>'answer')::integer
          else (
            select (o.ordinality-1)::integer
              from jsonb_array_elements(q.value->'options') with ordinality o(value,ordinality)
             where o.value=q.value->'answer' or o.value=to_jsonb(q.value->>'answer')
             limit 1
          )
        end,
        'explanation',coalesce(q.value->>'explanation',''),
        'option_count',jsonb_array_length(q.value->'options')
      ) order by q.ordinality
    )
    into v_public_questions,v_answer_keys
    from jsonb_array_elements(v_config->'questions') with ordinality q(value,ordinality)
   where jsonb_typeof(q.value->'question')='string'
     and length(btrim(coalesce(q.value->>'question','')))>0
     and case when jsonb_typeof(q.value->'options')='array'
       then jsonb_array_length(q.value->'options')>=2
         and not exists(
           select 1 from jsonb_array_elements(q.value->'options') o(value)
            where jsonb_typeof(o.value) is distinct from 'string'
         )
       else false end;

  if exists(
    select 1 from jsonb_array_elements(v_answer_keys) k(value)
     where k.value->>'answer_index' is null
        or (k.value->>'answer_index')::integer<0
        or (k.value->>'answer_index')::integer >= (k.value->>'option_count')::integer
  ) then
    raise exception 'يوجد سؤال بإجابة صحيحة غير صالحة';
  end if;

  insert into public.room_game_sessions(room_id,game_id,host_id,questions)
  values(p_room_id,p_game_id,v_user,v_public_questions)
  returning id into v_session;

  insert into private.room_game_answer_keys(session_id,answer_keys)
  values(v_session,v_answer_keys);

  insert into public.room_game_players(session_id,user_id)
  values(v_session,v_user);

  return v_session;
end;
$function$;

create or replace function public.room_game_start(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_room uuid;
  v_count integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  select host_id,room_id into v_host,v_room
    from public.room_game_sessions
   where id=p_session_id and status='lobby'
   for update;

  if v_host is null or v_host<>v_user then
    raise exception 'بدء الجولة متاح لمضيفها فقط';
  end if;

  perform 1 from public.room_members rm
   where rm.room_id=v_room and rm.user_id=v_user
   for key share;
  if not found then
    raise exception 'يجب أن يبقى مضيف الجولة داخل الغرفة لبدئها';
  end if;

  select count(*) into v_count
    from public.room_game_players
   where session_id=p_session_id;

  if v_count<2 then raise exception 'تحتاج الجولة إلى لاعبين اثنين على الأقل'; end if;

  update public.room_game_sessions
     set status='active',started_at=now(),question_started_at=now()
   where id=p_session_id;

  return jsonb_build_object('started',true,'players',v_count);
end;
$function$;

create or replace function public.room_game_next(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_room uuid;
  v_idx integer;
  v_total integer;
  v_question_started timestamptz;
  v_players integer;
  v_answers integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  select host_id,room_id,current_question_index,jsonb_array_length(questions),question_started_at
    into v_host,v_room,v_idx,v_total,v_question_started
    from public.room_game_sessions
   where id=p_session_id and status='active'
   for update;

  if v_host is null or v_host<>v_user then
    raise exception 'الانتقال بين الأسئلة متاح لمضيف الجولة فقط';
  end if;

  perform 1 from public.room_members rm
   where rm.room_id=v_room and rm.user_id=v_user
   for key share;
  if not found then
    raise exception 'يجب أن يبقى مضيف الجولة داخل الغرفة للانتقال بين الأسئلة';
  end if;

  select count(*) into v_players
    from public.room_game_players
   where session_id=p_session_id;

  select count(*) into v_answers
    from public.room_game_answers
   where session_id=p_session_id and question_index=v_idx;

  if v_answers<v_players and coalesce(v_question_started,now())+interval '30 seconds'>now() then
    raise exception 'انتظري إجابات اللاعبين أو انتهاء مهلة السؤال';
  end if;

  if v_idx+1>=v_total then
    update public.room_game_sessions
       set status='completed',ended_at=now()
     where id=p_session_id;
    return jsonb_build_object('completed',true);
  end if;

  update public.room_game_sessions
     set current_question_index=v_idx+1,question_started_at=now()
   where id=p_session_id;

  return jsonb_build_object('completed',false,'question_index',v_idx+1);
end;
$function$;

create or replace function public.room_game_cancel(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_room uuid;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  select host_id,room_id into v_host,v_room
    from public.room_game_sessions
   where id=p_session_id and status in ('lobby','active')
   for update;

  if v_host is null or v_host<>v_user then
    raise exception 'إلغاء الجولة متاح لمضيفها فقط';
  end if;

  perform 1 from public.room_members rm
   where rm.room_id=v_room and rm.user_id=v_user
   for key share;
  if not found then
    raise exception 'يجب أن يبقى مضيف الجولة داخل الغرفة لإلغائها';
  end if;

  update public.room_game_sessions
     set status='cancelled',ended_at=now()
   where id=p_session_id;

  return jsonb_build_object('cancelled',true);
end;
$function$;
