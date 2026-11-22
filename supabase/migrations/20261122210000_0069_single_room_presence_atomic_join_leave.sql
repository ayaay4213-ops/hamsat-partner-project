-- Enforce one active room membership per account and make join/leave atomic.
-- Existing duplicate memberships are transient presence rows; keep the freshest
-- row per user and release seats belonging to removed memberships.
with ranked as (
  select room_id, user_id,
         row_number() over (partition by user_id order by last_seen_at desc, joined_at desc) as rn
    from public.room_members
)
delete from public.room_seats s
 using ranked r
 where r.rn > 1
   and s.room_id = r.room_id
   and s.user_id = r.user_id;

with ranked as (
  select room_id, user_id,
         row_number() over (partition by user_id order by last_seen_at desc, joined_at desc) as rn
    from public.room_members
)
delete from public.room_members m
 using ranked r
 where r.rn > 1
   and m.room_id = r.room_id
   and m.user_id = r.user_id;

create unique index if not exists room_members_one_room_per_user_uidx
  on public.room_members (user_id);

create or replace function public.join_room_presence(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  -- Serialize concurrent joins for the same account before moving its presence.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if not exists (select 1 from public.rooms where id = p_room_id) then
    raise exception 'الغرفة غير موجودة';
  end if;

  delete from public.room_seats
   where user_id = v_user
     and room_id <> p_room_id;

  delete from public.room_members
   where user_id = v_user
     and room_id <> p_room_id;

  insert into public.room_members (room_id, user_id, last_seen_at)
  values (p_room_id, v_user, now())
  on conflict (room_id, user_id)
  do update set last_seen_at = excluded.last_seen_at;

  return true;
end;
$$;

create or replace function public.leave_room_presence(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  delete from public.room_seats
   where room_id = p_room_id
     and user_id = v_user;

  delete from public.room_members
   where room_id = p_room_id
     and user_id = v_user;

  return true;
end;
$$;

revoke all on function public.join_room_presence(uuid) from public, anon;
revoke all on function public.leave_room_presence(uuid) from public, anon;
grant execute on function public.join_room_presence(uuid) to authenticated;
grant execute on function public.leave_room_presence(uuid) to authenticated;
