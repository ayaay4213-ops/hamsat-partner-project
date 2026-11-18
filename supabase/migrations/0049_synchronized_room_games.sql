-- HAMSAT synchronized room quiz sessions.
-- Prepared on the development branch only. Apply only after review and coordinated deployment.

create table if not exists public.room_game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_id text not null references public.games(id) on delete restrict,
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','active','completed','cancelled')),
  questions jsonb not null,
  current_question_index integer not null default 0 check (current_question_index >= 0),
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create index if not exists room_game_sessions_room_created_idx
  on public.room_game_sessions(room_id, created_at desc);
create index if not exists room_game_sessions_status_idx
  on public.room_game_sessions(room_id, status);
create unique index if not exists room_game_one_live_per_room_idx
  on public.room_game_sessions(room_id) where status in ('lobby','active');

create table if not exists public.room_game_players (
  session_id uuid not null references public.room_game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  primary key (session_id,user_id)
);
create index if not exists room_game_players_user_idx on public.room_game_players(user_id);

create table if not exists public.room_game_answers (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.room_game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  answer_index integer not null check (answer_index >= 0),
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique(session_id,user_id,question_index)
);
create index if not exists room_game_answers_session_question_idx
  on public.room_game_answers(session_id,question_index);

create schema if not exists private;
create table if not exists private.room_game_answer_keys (
  session_id uuid primary key references public.room_game_sessions(id) on delete cascade,
  answer_keys jsonb not null
);
revoke all on private.room_game_answer_keys from public, anon, authenticated;

alter table public.room_game_sessions enable row level security;
alter table public.room_game_players enable row level security;
alter table public.room_game_answers enable row level security;

drop policy if exists "Room members read game sessions" on public.room_game_sessions;
create policy "Room members read game sessions" on public.room_game_sessions
for select to authenticated
using (
  exists(select 1 from public.room_members rm where rm.room_id=room_game_sessions.room_id and rm.user_id=(select auth.uid()))
  or host_id=(select auth.uid())
);

drop policy if exists "Room members read game players" on public.room_game_players;
create policy "Room members read game players" on public.room_game_players
for select to authenticated
using (
  exists(
    select 1 from public.room_game_sessions s
    join public.room_members rm on rm.room_id=s.room_id
    where s.id=room_game_players.session_id and rm.user_id=(select auth.uid())
  )
);

drop policy if exists "Room members read game answers" on public.room_game_answers;
create policy "Room members read game answers" on public.room_game_answers
for select to authenticated
using (
  user_id=(select auth.uid())
  and exists(
    select 1 from public.room_game_sessions s
    join public.room_members rm on rm.room_id=s.room_id
    where s.id=room_game_answers.session_id and rm.user_id=(select auth.uid())
  )
);

revoke all on public.room_game_sessions,public.room_game_players,public.room_game_answers from anon,authenticated;
grant select on public.room_game_sessions,public.room_game_players,public.room_game_answers to authenticated;

create or replace function public.room_game_create(p_room_id uuid,p_game_id text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
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
  select owner_id into v_owner from public.rooms where id=p_room_id for update;
  if v_owner is null or v_owner<>v_user then raise exception 'إنشاء الجولة متاح لمضيف الغرفة فقط'; end if;
  if exists(select 1 from public.room_game_sessions where room_id=p_room_id and status in ('lobby','active')) then
    raise exception 'توجد جولة جماعية مفتوحة في هذه الغرفة بالفعل';
  end if;
  select config into v_config from public.games where id=p_game_id and active=true and game_type in ('quiz','trivia');
  if not found then raise exception 'اللعبة غير متاحة'; end if;
  if jsonb_typeof(v_config->'questions') is distinct from 'array' then raise exception 'اللعبة لا تحتوي أسئلة صالحة'; end if;
  select count(*) into v_count from jsonb_array_elements(v_config->'questions') q(value)
   where jsonb_typeof(q.value->'question')='string'
     and length(btrim(coalesce(q.value->>'question','')))>0
     and case when jsonb_typeof(q.value->'options')='array'
       then jsonb_array_length(q.value->'options')>=2
         and not exists(select 1 from jsonb_array_elements(q.value->'options') o(value) where jsonb_typeof(o.value) is distinct from 'string')
       else false end;
  if v_count<1 or v_count>30 then raise exception 'يجب أن تحتوي الجولة من سؤال إلى 30 سؤالاً صالحاً'; end if;

  select
    jsonb_agg(jsonb_build_object('question',q.value->>'question','options',q.value->'options') order by q.ordinality),
    jsonb_agg(jsonb_build_object(
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
    ) order by q.ordinality)
  into v_public_questions,v_answer_keys
  from jsonb_array_elements(v_config->'questions') with ordinality q(value,ordinality)
  where jsonb_typeof(q.value->'question')='string'
    and length(btrim(coalesce(q.value->>'question','')))>0
    and case when jsonb_typeof(q.value->'options')='array'
      then jsonb_array_length(q.value->'options')>=2
        and not exists(select 1 from jsonb_array_elements(q.value->'options') o(value) where jsonb_typeof(o.value) is distinct from 'string')
      else false end;

  if exists(
    select 1 from jsonb_array_elements(v_answer_keys) k(value)
    where k.value->>'answer_index' is null
       or (k.value->>'answer_index')::integer<0
       or (k.value->>'answer_index')::integer >= (k.value->>'option_count')::integer
  ) then raise exception 'يوجد سؤال بإجابة صحيحة غير صالحة'; end if;

  insert into public.room_game_sessions(room_id,game_id,host_id,questions)
  values(p_room_id,p_game_id,v_user,v_public_questions)
  returning id into v_session;
  insert into private.room_game_answer_keys(session_id,answer_keys) values(v_session,v_answer_keys);
  insert into public.room_game_players(session_id,user_id) values(v_session,v_user);
  return v_session;
end;
$$;

create or replace function public.room_game_join(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_room uuid; v_status text;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select room_id,status into v_room,v_status from public.room_game_sessions where id=p_session_id for update;
  if v_room is null then raise exception 'الجولة غير موجودة'; end if;
  if not exists(select 1 from public.room_members where room_id=v_room and user_id=v_user) then
    raise exception 'يجب الانضمام إلى الغرفة أولاً';
  end if;
  if v_status<>'lobby' then raise exception 'بدأت الجولة أو انتهت بالفعل'; end if;
  insert into public.room_game_players(session_id,user_id) values(p_session_id,v_user)
  on conflict(session_id,user_id) do nothing;
  return jsonb_build_object('joined',true);
end;
$$;

create or replace function public.room_game_start(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_host uuid; v_count integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select host_id into v_host from public.room_game_sessions where id=p_session_id and status='lobby' for update;
  if v_host is null or v_host<>v_user then raise exception 'بدء الجولة متاح لمضيفها فقط'; end if;
  select count(*) into v_count from public.room_game_players where session_id=p_session_id;
  if v_count<2 then raise exception 'تحتاج الجولة إلى لاعبين اثنين على الأقل'; end if;
  update public.room_game_sessions set status='active',started_at=now(),question_started_at=now() where id=p_session_id;
  return jsonb_build_object('started',true,'players',v_count);
end;
$$;

create or replace function public.room_game_answer(p_session_id uuid,p_answer_index integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_question integer;
  v_options jsonb;
  v_key jsonb;
  v_correct integer;
  v_is_correct boolean;
  v_score integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select s.current_question_index,s.questions->s.current_question_index
    into v_question,v_options
    from public.room_game_sessions s
    join public.room_game_players p on p.session_id=s.id and p.user_id=v_user
   where s.id=p_session_id and s.status='active'
   for update of s;
  if v_question is null then raise exception 'الجولة غير نشطة أو لم تنضم إليها'; end if;
  if p_answer_index<0 or p_answer_index>=jsonb_array_length(v_options->'options') then raise exception 'الإجابة غير صالحة'; end if;
  select answer_keys->v_question into v_key from private.room_game_answer_keys where session_id=p_session_id;
  v_correct := (v_key->>'answer_index')::integer;
  v_is_correct := p_answer_index=v_correct;
  if exists(select 1 from public.room_game_answers where session_id=p_session_id and user_id=v_user and question_index=v_question) then
    raise exception 'تم تسجيل إجابتك لهذا السؤال بالفعل';
  end if;
  insert into public.room_game_answers(session_id,user_id,question_index,answer_index,is_correct)
  values(p_session_id,v_user,v_question,p_answer_index,v_is_correct);
  if v_is_correct then update public.room_game_players set score=score+1 where session_id=p_session_id and user_id=v_user; end if;
  select score into v_score from public.room_game_players where session_id=p_session_id and user_id=v_user;
  return jsonb_build_object('is_correct',v_is_correct,'correct_answer_index',v_correct,'explanation',coalesce(v_key->>'explanation',''),'score',v_score);
end;
$$;

create or replace function public.room_game_next(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_host uuid; v_idx integer; v_total integer; v_question_started timestamptz; v_players integer; v_answers integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select host_id,current_question_index,jsonb_array_length(questions),question_started_at
    into v_host,v_idx,v_total,v_question_started
    from public.room_game_sessions where id=p_session_id and status='active' for update;
  if v_host is null or v_host<>v_user then raise exception 'الانتقال بين الأسئلة متاح لمضيف الجولة فقط'; end if;
  select count(*) into v_players from public.room_game_players where session_id=p_session_id;
  select count(*) into v_answers from public.room_game_answers where session_id=p_session_id and question_index=v_idx;
  if v_answers<v_players and coalesce(v_question_started,now())+interval '30 seconds'>now() then
    raise exception 'انتظري إجابات اللاعبين أو انتهاء مهلة السؤال';
  end if;
  if v_idx+1>=v_total then
    update public.room_game_sessions set status='completed',ended_at=now() where id=p_session_id;
    return jsonb_build_object('completed',true);
  end if;
  update public.room_game_sessions set current_question_index=v_idx+1,question_started_at=now() where id=p_session_id;
  return jsonb_build_object('completed',false,'question_index',v_idx+1);
end;
$$;

create or replace function public.room_game_cancel(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $
declare v_user uuid := (select auth.uid()); v_host uuid;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select host_id into v_host from public.room_game_sessions
   where id=p_session_id and status in ('lobby','active') for update;
  if v_host is null or v_host<>v_user then raise exception 'إلغاء الجولة متاح لمضيفها فقط'; end if;
  update public.room_game_sessions set status='cancelled',ended_at=now() where id=p_session_id;
  return jsonb_build_object('cancelled',true);
end;
$;

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
    'players',v_players,'my_answer',v_my_answer
  );
end;
$$;

revoke all on function public.room_game_create(uuid,text) from public,anon;
revoke all on function public.room_game_join(uuid) from public,anon;
revoke all on function public.room_game_start(uuid) from public,anon;
revoke all on function public.room_game_answer(uuid,integer) from public,anon;
revoke all on function public.room_game_next(uuid) from public,anon;
revoke all on function public.room_game_state(uuid) from public,anon;
revoke all on function public.room_game_cancel(uuid) from public,anon;
grant execute on function public.room_game_create(uuid,text) to authenticated;
grant execute on function public.room_game_join(uuid) to authenticated;
grant execute on function public.room_game_start(uuid) to authenticated;
grant execute on function public.room_game_answer(uuid,integer) to authenticated;
grant execute on function public.room_game_next(uuid) to authenticated;
grant execute on function public.room_game_state(uuid) to authenticated;
grant execute on function public.room_game_cancel(uuid) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_game_sessions') then
    alter publication supabase_realtime add table public.room_game_sessions;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_game_players') then
    alter publication supabase_realtime add table public.room_game_players;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_game_answers') then
    alter publication supabase_realtime add table public.room_game_answers;
  end if;
end $$;
