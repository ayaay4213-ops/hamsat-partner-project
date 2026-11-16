-- HAMSAT levels, activity XP, earned badges and public cosmetic inventory.
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  updated_at timestamptz not null default now()
);
create table if not exists public.badge_catalog (
  id text primary key, name text not null, description text not null default '',
  icon text not null default '✦', rarity text not null default 'عادي',
  sort_order integer not null default 0, active boolean not null default true
);
create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null references public.badge_catalog(id),
  earned_at timestamptz not null default now(), primary key(user_id,badge_id)
);
create table if not exists public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, source_key text not null,
  points integer not null check(points > 0), created_at timestamptz not null default now(),
  unique(user_id,event_type,source_key)
);
alter table public.user_progress enable row level security;
alter table public.badge_catalog enable row level security;
alter table public.user_badges enable row level security;
alter table public.xp_events enable row level security;
drop policy if exists "Authenticated can read member progress" on public.user_progress;
create policy "Authenticated can read member progress" on public.user_progress for select to authenticated using (true);
drop policy if exists "Authenticated can read active badges" on public.badge_catalog;
create policy "Authenticated can read active badges" on public.badge_catalog for select to authenticated using (active = true);
drop policy if exists "Authenticated can view earned badges" on public.user_badges;
create policy "Authenticated can view earned badges" on public.user_badges for select to authenticated using (true);
revoke all on public.user_progress,public.badge_catalog,public.user_badges,public.xp_events from anon,authenticated;
grant select on public.user_progress,public.badge_catalog,public.user_badges to authenticated;
revoke all on public.xp_events from anon,authenticated;
insert into public.user_progress(user_id,xp,level) select id,0,1 from public.profiles on conflict(user_id) do nothing;
insert into public.badge_catalog(id,name,description,icon,rarity,sort_order) values
('first_room','أول حضور','انضممتِ إلى أول غرفة صوتية','🎙️','عادي',1),
('friend_circle','دائرة الأصدقاء','كونتِ خمس صداقات حقيقية','🤝','نادر',2),
('gift_giver','يد العطاء','أرسلتِ عشر هدايا','🎁','نادر',3),
('beloved_voice','صوت محبوب','استقبلتِ عشر هدايا','💛','نادر',4),
('explorer','مستكشفة همسات','زرتِ عشرة ملفات شخصية مختلفة','🧭','عادي',5),
('level_five','نجمة متألقة','وصلتِ إلى المستوى الخامس','⭐','ملحمي',6)
on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,rarity=excluded.rarity,sort_order=excluded.sort_order,active=true;
create or replace function public.hamsat_level_for_xp(p_xp bigint) returns integer
language sql immutable set search_path='' as $$
select case when p_xp>=5000 then 10 when p_xp>=3800 then 9 when p_xp>=2800 then 8
when p_xp>=2000 then 7 when p_xp>=1400 then 6 when p_xp>=900 then 5
when p_xp>=500 then 4 when p_xp>=250 then 3 when p_xp>=100 then 2 else 1 end;
$$;
create or replace function public.grant_hamsat_xp(p_user_id uuid,p_event_type text,p_source_key text,p_points integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_added integer; v_xp bigint; v_level integer; v_count bigint;
begin
 if p_user_id is null or p_points is null or p_points<1 or p_points>100 then return; end if;
 insert into public.xp_events(user_id,event_type,source_key,points) values(p_user_id,p_event_type,p_source_key,p_points)
 on conflict(user_id,event_type,source_key) do nothing;
 get diagnostics v_added=row_count; if v_added=0 then return; end if;
 insert into public.user_progress(user_id,xp,level) values(p_user_id,p_points,public.hamsat_level_for_xp(p_points))
 on conflict(user_id) do update set xp=public.user_progress.xp+excluded.xp,
 level=public.hamsat_level_for_xp(public.user_progress.xp+excluded.xp),updated_at=now();
 select xp,level into v_xp,v_level from public.user_progress where user_id=p_user_id;
 if p_event_type='room_join' then
  select count(*) into v_count from public.xp_events where user_id=p_user_id and event_type='room_join';
  if v_count>=1 then insert into public.user_badges(user_id,badge_id) values(p_user_id,'first_room') on conflict do nothing; end if;
 elsif p_event_type='friend_accepted' then
  select count(*) into v_count from public.xp_events where user_id=p_user_id and event_type='friend_accepted';
  if v_count>=5 then insert into public.user_badges(user_id,badge_id) values(p_user_id,'friend_circle') on conflict do nothing; end if;
 elsif p_event_type='gift_sent' then
  select count(*) into v_count from public.xp_events where user_id=p_user_id and event_type='gift_sent';
  if v_count>=10 then insert into public.user_badges(user_id,badge_id) values(p_user_id,'gift_giver') on conflict do nothing; end if;
 elsif p_event_type='gift_received' then
  select count(*) into v_count from public.xp_events where user_id=p_user_id and event_type='gift_received';
  if v_count>=10 then insert into public.user_badges(user_id,badge_id) values(p_user_id,'beloved_voice') on conflict do nothing; end if;
 elsif p_event_type='profile_visit' then
  select count(*) into v_count from public.xp_events where user_id=p_user_id and event_type='profile_visit';
  if v_count>=10 then insert into public.user_badges(user_id,badge_id) values(p_user_id,'explorer') on conflict do nothing; end if;
 end if;
 if v_level>=5 then insert into public.user_badges(user_id,badge_id) values(p_user_id,'level_five') on conflict do nothing; end if;
end; $$;
create or replace function public.hamsat_xp_on_room_join() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.grant_hamsat_xp(new.user_id,'room_join',new.room_id::text,5); return new; end; $$;
create or replace function public.hamsat_xp_on_friend_accept() returns trigger language plpgsql security definer set search_path='' as $$
begin if old.status is distinct from 'accepted' and new.status='accepted' then
 perform public.grant_hamsat_xp(new.sender_id,'friend_accepted',new.id::text,15);
 perform public.grant_hamsat_xp(new.receiver_id,'friend_accepted',new.id::text,15);
 end if; return new; end; $$;
create or replace function public.hamsat_xp_on_gift() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.grant_hamsat_xp(new.sender_id,'gift_sent',new.id::text,2);
 perform public.grant_hamsat_xp(new.recipient_id,'gift_received',new.id::text,5); return new; end; $$;
create or replace function public.hamsat_xp_on_profile_visit() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.grant_hamsat_xp(new.visitor_id,'profile_visit',new.profile_id::text||':'||new.visited_on::text,1); return new; end; $$;
drop trigger if exists trg_hamsat_xp_room_join on public.room_members;
create trigger trg_hamsat_xp_room_join after insert on public.room_members for each row execute function public.hamsat_xp_on_room_join();
drop trigger if exists trg_hamsat_xp_friend_accept on public.friend_requests;
create trigger trg_hamsat_xp_friend_accept after update of status on public.friend_requests for each row execute function public.hamsat_xp_on_friend_accept();
drop trigger if exists trg_hamsat_xp_gift on public.gift_transactions;
create trigger trg_hamsat_xp_gift after insert on public.gift_transactions for each row execute function public.hamsat_xp_on_gift();
drop trigger if exists trg_hamsat_xp_profile_visit on public.profile_visits;
create trigger trg_hamsat_xp_profile_visit after insert on public.profile_visits for each row execute function public.hamsat_xp_on_profile_visit();
drop policy if exists "Members can view owned cosmetics publicly" on public.user_inventory;
create policy "Members can view owned cosmetics publicly" on public.user_inventory for select to authenticated using (true);
revoke all on function public.grant_hamsat_xp(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.hamsat_level_for_xp(bigint) from public,anon,authenticated;
revoke all on function public.hamsat_xp_on_room_join() from public,anon,authenticated;
revoke all on function public.hamsat_xp_on_friend_accept() from public,anon,authenticated;
revoke all on function public.hamsat_xp_on_gift() from public,anon,authenticated;
revoke all on function public.hamsat_xp_on_profile_visit() from public,anon,authenticated;
