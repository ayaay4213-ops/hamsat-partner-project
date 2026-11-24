-- HAMSAT room integrity hardening: game deadlines, gift idempotency and host activity.
-- Development branch only. Review and test before applying to the live Supabase project.

-- 1) Room-game answers must arrive inside the server-authoritative 30-second window.
create or replace function public.room_game_answer(p_session_id uuid,p_answer_index integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_question integer;
  v_room_id uuid;
  v_options jsonb;
  v_started_at timestamptz;
  v_key jsonb;
  v_correct integer;
  v_is_correct boolean;
  v_score integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select s.current_question_index,s.room_id,s.questions->s.current_question_index,s.question_started_at
    into v_question,v_room_id,v_options,v_started_at
    from public.room_game_sessions s
    join public.room_game_players p on p.session_id=s.id and p.user_id=v_user
   where s.id=p_session_id and s.status='active'
   for update of s;
  if v_question is null then raise exception 'الجولة غير نشطة أو لم تنضم إليها'; end if;
  if not exists(select 1 from public.room_members rm where rm.room_id=v_room_id and rm.user_id=v_user) then
    raise exception 'يجب البقاء داخل الغرفة للإجابة';
  end if;
  if v_started_at is null or now() >= v_started_at + interval '30 seconds' then
    raise exception 'انتهى وقت الإجابة عن هذا السؤال';
  end if;
  if p_answer_index is null or p_answer_index<0 or p_answer_index>=jsonb_array_length(v_options->'options') then
    raise exception 'الإجابة غير صالحة';
  end if;
  select answer_keys->v_question into v_key
    from private.room_game_answer_keys where session_id=p_session_id;
  v_correct := (v_key->>'answer_index')::integer;
  v_is_correct := p_answer_index=v_correct;
  if exists(select 1 from public.room_game_answers where session_id=p_session_id and user_id=v_user and question_index=v_question) then
    raise exception 'تم تسجيل إجابتك لهذا السؤال بالفعل';
  end if;
  insert into public.room_game_answers(session_id,user_id,question_index,answer_index,is_correct)
  values(p_session_id,v_user,v_question,p_answer_index,v_is_correct);
  if v_is_correct then
    update public.room_game_players set score=score+1 where session_id=p_session_id and user_id=v_user;
  end if;
  select score into v_score from public.room_game_players where session_id=p_session_id and user_id=v_user;
  return jsonb_build_object('is_correct',v_is_correct,'correct_answer_index',v_correct,
    'explanation',coalesce(v_key->>'explanation',''),'score',v_score);
end;
$$;

create or replace function public.room_game_state(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.room_game_sessions%rowtype;
  v_players jsonb;
  v_my_answer jsonb;
  v_room_member boolean;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_session from public.room_game_sessions where id=p_session_id;
  if not found then raise exception 'الجولة غير موجودة'; end if;
  select exists(select 1 from public.room_members where room_id=v_session.room_id and user_id=v_user)
    into v_room_member;
  if not v_room_member and v_session.host_id<>v_user then raise exception 'لا تملكين صلاحية مشاهدة هذه الجولة'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'score',p.score,'display_name',coalesce(pr.display_name,'عضو'),'avatar_url',pr.avatar_url
  ) order by p.joined_at),'[]'::jsonb)
  into v_players
  from public.room_game_players p left join public.profiles pr on pr.id=p.user_id
  where p.session_id=p_session_id;
  select jsonb_build_object('answer_index',a.answer_index,'is_correct',a.is_correct)
    into v_my_answer
    from public.room_game_answers a
   where a.session_id=p_session_id and a.user_id=v_user and a.question_index=v_session.current_question_index;
  return jsonb_build_object(
    'id',v_session.id,'room_id',v_session.room_id,'game_id',v_session.game_id,'host_id',v_session.host_id,
    'status',v_session.status,'current_question_index',v_session.current_question_index,
    'question_count',jsonb_array_length(v_session.questions),
    'question',v_session.questions->v_session.current_question_index,
    'question_started_at',v_session.question_started_at,'server_now',now(),
    'players',v_players,'my_answer',v_my_answer
  );
end;
$$;

revoke all on function public.room_game_answer(uuid,integer) from public,anon;
revoke all on function public.room_game_state(uuid) from public,anon;
grant execute on function public.room_game_answer(uuid,integer) to authenticated;
grant execute on function public.room_game_state(uuid) to authenticated;

-- 2) Idempotency ledger. A retry with the same request UUID returns the original result
-- without repeating wallet mutations or room activity events.
create table if not exists private.gift_request_results (
  sender_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('direct','room','room_all')),
  request_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (sender_id,operation,request_id)
);
create index if not exists gift_request_results_created_at_idx
  on private.gift_request_results(created_at);
alter table private.gift_request_results enable row level security;
revoke all on private.gift_request_results from public,anon,authenticated;

create or replace function private.claim_gift_request(p_sender uuid,p_operation text,p_request_id uuid)
returns jsonb
language plpgsql
set search_path=''
as $$
declare v_result jsonb;
begin
  if p_sender is null or p_request_id is null then raise exception 'معرّف طلب الهدية غير صالح'; end if;
  insert into private.gift_request_results(sender_id,operation,request_id)
  values(p_sender,p_operation,p_request_id)
  on conflict(sender_id,operation,request_id) do nothing;
  if found then return null; end if;
  select result into v_result
    from private.gift_request_results
   where sender_id=p_sender and operation=p_operation and request_id=p_request_id
   for update;
  if v_result is null then raise exception 'الطلب قيد المعالجة؛ أعيدي المحاولة بالمعرّف نفسه'; end if;
  return v_result;
end;
$$;

create or replace function private.complete_gift_request(p_sender uuid,p_operation text,p_request_id uuid,p_result jsonb)
returns void
language plpgsql
set search_path=''
as $$
begin
  update private.gift_request_results
     set result=p_result
   where sender_id=p_sender and operation=p_operation and request_id=p_request_id;
  if not found then raise exception 'تعذّر حفظ نتيجة طلب الهدية'; end if;
end;
$$;
revoke all on function private.claim_gift_request(uuid,text,uuid) from public,anon,authenticated;
revoke all on function private.complete_gift_request(uuid,text,uuid,jsonb) from public,anon,authenticated;

-- New direct-gift RPC requires a stable request UUID.
create or replace function public.send_gift(p_recipient uuid,p_gift_id text,p_quantity integer,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sender uuid := (select auth.uid());
  v_cached jsonb;
  v_result jsonb;
  v_price bigint;
  v_total bigint;
  v_sender_balance bigint;
  v_recipient_balance bigint;
  v_gift_name text;
begin
  if v_sender is null then raise exception 'يجب تسجيل الدخول'; end if;
  v_cached := private.claim_gift_request(v_sender,'direct',p_request_id);
  if v_cached is not null then return v_cached; end if;
  if p_recipient is null or p_recipient=v_sender then raise exception 'لا يمكن إرسال هدية إلى نفسك'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>100 then raise exception 'الكمية غير صالحة'; end if;
  select price,name into v_price,v_gift_name from public.gifts where id=p_gift_id and active=true;
  if v_price is null then raise exception 'الهدية غير متاحة'; end if;
  v_total := v_price*p_quantity;
  update public.wallets set balance=balance-v_total,updated_at=now()
   where user_id=v_sender and balance>=v_total returning balance into v_sender_balance;
  if v_sender_balance is null then raise exception 'رصيدك غير كافٍ'; end if;
  insert into public.wallets(user_id,balance) values(p_recipient,0) on conflict(user_id) do nothing;
  update public.wallets set balance=balance+v_total,updated_at=now()
   where user_id=p_recipient returning balance into v_recipient_balance;
  if v_recipient_balance is null then raise exception 'المستلم غير موجود'; end if;
  insert into public.wallet_transactions(user_id,amount,transaction_type,label)
  values (v_sender,-v_total,'gift_sent','إرسال '||v_gift_name),
         (p_recipient,v_total,'gift_received','استلام '||v_gift_name);
  insert into public.gift_transactions(sender_id,recipient_id,gift_id,quantity,total_price)
  values(v_sender,p_recipient,p_gift_id,p_quantity,v_total);
  v_result := jsonb_build_object('sender_balance',v_sender_balance,'recipient_balance',v_recipient_balance,
    'total_price',v_total,'gift_name',v_gift_name,'quantity',p_quantity);
  perform private.complete_gift_request(v_sender,'direct',p_request_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.send_gift(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.send_gift(uuid,text,integer,uuid) from public,anon;
grant execute on function public.send_gift(uuid,text,integer,uuid) to authenticated;

create or replace function public.send_room_gift(p_room_id uuid,p_recipient uuid,p_gift_id text,p_quantity integer,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_cached jsonb;
  v_result jsonb;
  v_gift_result jsonb;
  v_event_id bigint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  v_cached := private.claim_gift_request(v_user,'room',p_request_id);
  if v_cached is not null then return v_cached; end if;
  if p_room_id is null or p_recipient is null then raise exception 'بيانات الهدية غير مكتملة'; end if;
  if p_quantity is null or p_quantity not in (1,10,99) then raise exception 'الكمية المتاحة هي 1 أو 10 أو 99'; end if;
  if not private.is_room_member(p_room_id) then raise exception 'انضمي إلى الغرفة أولاً'; end if;
  if not exists(select 1 from public.room_seats s where s.room_id=p_room_id and s.user_id=p_recipient) then
    raise exception 'يمكن إرسال هدايا الغرفة إلى الجالسين على مقاعد المايك فقط';
  end if;
  v_gift_result := public.send_gift(p_recipient,p_gift_id,p_quantity,gen_random_uuid());
  insert into public.room_activity_events(room_id,actor_id,target_user_id,event_type,payload)
  values(p_room_id,v_user,p_recipient,'gift',jsonb_build_object(
    'gift_id',p_gift_id,'gift_name',v_gift_result->>'gift_name','quantity',p_quantity,
    'total_price',(v_gift_result->>'total_price')::bigint
  )) returning id into v_event_id;
  v_result := v_gift_result||jsonb_build_object('event_id',v_event_id);
  perform private.complete_gift_request(v_user,'room',p_request_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.send_room_gift(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.send_room_gift(uuid,uuid,text,integer,uuid) from public,anon;
grant execute on function public.send_room_gift(uuid,uuid,text,integer,uuid) to authenticated;

create or replace function public.send_room_gift_to_all(p_room_id uuid,p_gift_id text,p_quantity integer,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_cached jsonb;
  v_result jsonb;
  v_recipient uuid;
  v_gift_result jsonb;
  v_event_id bigint;
  v_count integer := 0;
  v_total bigint := 0;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  v_cached := private.claim_gift_request(v_user,'room_all',p_request_id);
  if v_cached is not null then return v_cached; end if;
  if p_room_id is null or p_quantity is null or p_quantity not in (1,10,99) then
    raise exception 'بيانات الهدية أو الكمية غير صالحة';
  end if;
  if not private.is_room_member(p_room_id) then raise exception 'انضمي إلى الغرفة أولاً'; end if;
  for v_recipient in
    select distinct s.user_id from public.room_seats s
     where s.room_id=p_room_id and s.user_id<>v_user order by s.user_id
  loop
    v_gift_result := public.send_gift(v_recipient,p_gift_id,p_quantity,gen_random_uuid());
    v_total := v_total+(v_gift_result->>'total_price')::bigint;
    insert into public.room_activity_events(room_id,actor_id,target_user_id,event_type,payload)
    values(p_room_id,v_user,v_recipient,'gift',jsonb_build_object(
      'gift_id',p_gift_id,'gift_name',v_gift_result->>'gift_name','quantity',p_quantity,
      'total_price',(v_gift_result->>'total_price')::bigint,'all_recipients',true
    )) returning id into v_event_id;
    v_count := v_count+1;
  end loop;
  if v_count=0 then raise exception 'لا يوجد أعضاء آخرون على مقاعد المايك'; end if;
  v_result := jsonb_build_object('success',true,'recipients_count',v_count,'total_price',v_total,'quantity',p_quantity);
  perform private.complete_gift_request(v_user,'room_all',p_request_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.send_room_gift_to_all(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.send_room_gift_to_all(uuid,text,integer,uuid) from public,anon;
grant execute on function public.send_room_gift_to_all(uuid,text,integer,uuid) to authenticated;

-- 3) Count host time only while the host remains a room member and holds a microphone seat.
create or replace function public.host_start_session(p_room_id uuid)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_agency uuid;
  v_session bigint;
  v_old public.agency_host_sessions%rowtype;
  v_seconds bigint;
  v_end_at timestamptz;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_room_id is null or not private.is_room_member(p_room_id) then raise exception 'انضمي إلى الغرفة أولاً'; end if;
  if not exists(select 1 from public.room_seats where room_id=p_room_id and user_id=v_user) then
    raise exception 'يجب حجز مقعد مايك قبل بدء احتساب جلسة المضيف';
  end if;
  select m.agency_id into v_agency
    from public.agency_members m join public.agencies a on a.id=m.agency_id
   where m.user_id=v_user and m.member_role='host' and m.status='active'
     and a.status='active' and a.agency_type in ('hosts','both')
   order by m.joined_at desc limit 1;
  if v_agency is null then return null; end if;
  select * into v_old from public.agency_host_sessions
   where agency_id=v_agency and host_id=v_user and ended_at is null for update;
  if found then
    if v_old.last_heartbeat_at < now()-interval '90 seconds' then
      v_end_at := least(now(),coalesce(v_old.last_heartbeat_at,v_old.started_at)+interval '45 seconds');
      v_seconds := greatest(0,floor(extract(epoch from (v_end_at-v_old.started_at)))::bigint);
      update public.agency_host_sessions
         set ended_at=now(),duration_seconds=v_seconds,last_heartbeat_at=v_end_at
       where id=v_old.id;
      insert into public.agency_host_daily_stats(agency_id,host_id,stat_date,live_seconds,session_count)
      values(v_old.agency_id,v_old.host_id,(now() at time zone 'Africa/Algiers')::date,v_seconds,1)
      on conflict(agency_id,host_id,stat_date) do update
        set live_seconds=public.agency_host_daily_stats.live_seconds+excluded.live_seconds,
            session_count=public.agency_host_daily_stats.session_count+1,updated_at=now();
    else
      update public.agency_host_sessions set last_heartbeat_at=now(),room_id=p_room_id where id=v_old.id;
      return v_old.id;
    end if;
  end if;
  insert into public.agency_host_sessions(agency_id,host_id,room_id)
  values(v_agency,v_user,p_room_id) returning id into v_session;
  return v_session;
end;
$$;

create or replace function public.host_heartbeat_session(p_session_id bigint)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  update public.agency_host_sessions s set last_heartbeat_at=now()
   where s.id=p_session_id and s.host_id=v_user and s.ended_at is null
     and exists(select 1 from public.room_members rm where rm.room_id=s.room_id and rm.user_id=v_user)
     and exists(select 1 from public.room_seats rs where rs.room_id=s.room_id and rs.user_id=v_user)
     and exists(
       select 1 from public.agency_members m join public.agencies a on a.id=m.agency_id
        where m.agency_id=s.agency_id and m.user_id=v_user and m.member_role='host'
          and m.status='active' and a.status='active' and a.agency_type in ('hosts','both')
     );
  return found;
end;
$$;

create or replace function public.host_end_session(p_session_id bigint)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_session public.agency_host_sessions%rowtype; v_seconds bigint; v_end_at timestamptz;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_session from public.agency_host_sessions
   where id=p_session_id and host_id=v_user and ended_at is null for update;
  if not found then return false; end if;
  v_end_at := least(now(),coalesce(v_session.last_heartbeat_at,v_session.started_at)+interval '45 seconds');
  v_seconds := greatest(0,floor(extract(epoch from (v_end_at-v_session.started_at)))::bigint);
  update public.agency_host_sessions set ended_at=now(),duration_seconds=v_seconds,last_heartbeat_at=v_end_at
   where id=p_session_id;
  insert into public.agency_host_daily_stats(agency_id,host_id,stat_date,live_seconds,session_count)
  values(v_session.agency_id,v_session.host_id,(now() at time zone 'Africa/Algiers')::date,v_seconds,1)
  on conflict(agency_id,host_id,stat_date) do update
    set live_seconds=public.agency_host_daily_stats.live_seconds+excluded.live_seconds,
        session_count=public.agency_host_daily_stats.session_count+1,updated_at=now();
  return true;
end;
$$;

revoke all on function public.host_start_session(uuid) from public,anon;
revoke all on function public.host_heartbeat_session(bigint) from public,anon;
revoke all on function public.host_end_session(bigint) from public,anon;
grant execute on function public.host_start_session(uuid) to authenticated;
grant execute on function public.host_heartbeat_session(bigint) to authenticated;
grant execute on function public.host_end_session(bigint) to authenticated;
