-- Host agency session tracking and gift-performance ledger.
create table if not exists public.agency_host_sessions (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds bigint not null default 0 check (duration_seconds >= 0)
);
create unique index if not exists agency_host_one_active_session
  on public.agency_host_sessions(agency_id,host_id) where ended_at is null;
create index if not exists agency_host_sessions_agency_started_idx
  on public.agency_host_sessions(agency_id,started_at desc);

create table if not exists public.agency_host_daily_stats (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  stat_date date not null default current_date,
  live_seconds bigint not null default 0 check (live_seconds >= 0),
  gift_coins bigint not null default 0 check (gift_coins >= 0),
  session_count integer not null default 0 check (session_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (agency_id,host_id,stat_date)
);

alter table public.agency_host_sessions enable row level security;
alter table public.agency_host_daily_stats enable row level security;
create policy "Hosts and agency managers read sessions" on public.agency_host_sessions
for select to authenticated using (
  public.is_admin() or host_id=auth.uid() or private.is_agency_member(agency_id,array['owner','manager'])
);
create policy "Hosts and agency managers read host stats" on public.agency_host_daily_stats
for select to authenticated using (
  public.is_admin() or host_id=auth.uid() or private.is_agency_member(agency_id,array['owner','manager'])
);
grant select on public.agency_host_sessions,public.agency_host_daily_stats to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.agency_host_sessions,public.agency_host_daily_stats from anon,authenticated;

create or replace function public.host_start_session(p_room_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_agency uuid;
  v_session bigint;
  v_old public.agency_host_sessions%rowtype;
  v_seconds bigint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_room_id is null or not private.is_room_member(p_room_id) then raise exception 'انضمي إلى الغرفة أولاً'; end if;

  select m.agency_id into v_agency
    from public.agency_members m join public.agencies a on a.id=m.agency_id
   where m.user_id=v_user and m.member_role='host' and m.status='active'
     and a.status='active' and a.agency_type in ('hosts','both')
   order by m.joined_at desc limit 1;

  if v_agency is null then return null; end if;

  select * into v_old from public.agency_host_sessions
   where agency_id=v_agency and host_id=v_user and ended_at is null
   for update;
  if found then
    if v_old.last_heartbeat_at < now()-interval '90 seconds' then
      v_seconds := greatest(0,floor(extract(epoch from (v_old.last_heartbeat_at-v_old.started_at)))::bigint);
      update public.agency_host_sessions set ended_at=now(),duration_seconds=v_seconds where id=v_old.id;
      insert into public.agency_host_daily_stats(agency_id,host_id,stat_date,live_seconds,session_count)
      values(v_old.agency_id,v_old.host_id,current_date,v_seconds,1)
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
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  update public.agency_host_sessions set last_heartbeat_at=now()
   where id=p_session_id and host_id=auth.uid() and ended_at is null;
  return found;
end;
$$;

create or replace function public.host_end_session(p_session_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.agency_host_sessions%rowtype; v_seconds bigint;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_session from public.agency_host_sessions
   where id=p_session_id and host_id=auth.uid() and ended_at is null
   for update;
  if not found then return false; end if;
  v_seconds := greatest(0,floor(extract(epoch from (now()-v_session.started_at)))::bigint);
  update public.agency_host_sessions set ended_at=now(),duration_seconds=v_seconds,last_heartbeat_at=now()
   where id=p_session_id;
  insert into public.agency_host_daily_stats(agency_id,host_id,stat_date,live_seconds,session_count)
  values(v_session.agency_id,v_session.host_id,current_date,v_seconds,1)
  on conflict(agency_id,host_id,stat_date) do update
    set live_seconds=public.agency_host_daily_stats.live_seconds+excluded.live_seconds,
        session_count=public.agency_host_daily_stats.session_count+1,updated_at=now();
  return true;
end;
$$;

create or replace function private.record_agency_host_gift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_amount bigint := greatest(0,coalesce((new.payload->>'total_price')::bigint,0)); v_member record;
begin
  if new.event_type<>'gift' or new.target_user_id is null or v_amount<=0 then return new; end if;
  for v_member in
    select m.agency_id from public.agency_members m join public.agencies a on a.id=m.agency_id
     where m.user_id=new.target_user_id and m.member_role='host' and m.status='active'
       and a.status='active' and a.agency_type in ('hosts','both')
  loop
    insert into public.agency_host_daily_stats(agency_id,host_id,stat_date,gift_coins)
    values(v_member.agency_id,new.target_user_id,current_date,v_amount)
    on conflict(agency_id,host_id,stat_date) do update
      set gift_coins=public.agency_host_daily_stats.gift_coins+excluded.gift_coins,updated_at=now();
  end loop;
  return new;
end;
$$;
revoke all on function private.record_agency_host_gift() from public,anon,authenticated;
drop trigger if exists room_gift_updates_host_agency_stats on public.room_activity_events;
create trigger room_gift_updates_host_agency_stats
after insert on public.room_activity_events
for each row when (new.event_type='gift')
execute function private.record_agency_host_gift();

revoke all on function public.host_start_session(uuid) from public,anon;
grant execute on function public.host_start_session(uuid) to authenticated;
revoke all on function public.host_heartbeat_session(bigint) from public,anon;
grant execute on function public.host_heartbeat_session(bigint) to authenticated;
revoke all on function public.host_end_session(bigint) from public,anon;
grant execute on function public.host_end_session(bigint) to authenticated;
