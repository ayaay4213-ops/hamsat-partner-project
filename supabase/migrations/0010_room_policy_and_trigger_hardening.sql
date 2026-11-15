-- Security hardening for room membership policies and internal trigger functions.
-- Review and apply to Supabase only after confirming the target project and backup.

-- A single helper keeps room-membership checks consistent and avoids recursive RLS.
create or replace function public.is_room_member(
  p_room_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid, uuid) to authenticated;

-- Members may only see the occupants of rooms they have joined.
drop policy if exists "Room members can view occupants" on public.room_members;
create policy "Room members can view occupants"
  on public.room_members
  for select to authenticated
  using (public.is_room_member(room_members.room_id));

-- Prevent a member of one room from inserting messages into a different room.
drop policy if exists "Room members send their own messages" on public.room_messages;
create policy "Room members send their own messages"
  on public.room_messages
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.is_room_member(room_messages.room_id)
  );

-- Microphone-seat visibility follows the same room-membership boundary.
drop policy if exists "Members can view room seats" on public.room_seats;
drop policy if exists "Room members can view microphone seats" on public.room_seats;
create policy "Room members can view microphone seats"
  on public.room_seats
  for select to authenticated
  using (public.is_room_member(room_seats.room_id));

-- Remove the legacy two-argument helper from migration 0009 after its policies are replaced.
drop function if exists public.is_room_member(uuid, uuid);



-- Presence and seat changes are consumed by the room UI through Postgres Changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end
$$;

-- Serialize microphone seat allocation per room and reserve seat 1 for its owner.
-- Normalize the legacy smallint RPC to the integer signature used by migration 0009.
drop function if exists public.request_room_seat(uuid, smallint);
create or replace function public.request_room_seat(
  p_room_id uuid,
  p_seat_no integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  if p_room_id is null or p_seat_no is null or p_seat_no < 1 or p_seat_no > 8 then
    raise exception 'رقم مقعد المايك غير صالح';
  end if;

  select r.owner_id into v_owner
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_owner is null then
    raise exception 'الغرفة غير موجودة';
  end if;

  if not public.is_room_member(p_room_id) then
    raise exception 'انضمي إلى الغرفة أولاً قبل حجز المايك';
  end if;

  if p_seat_no = 1 and v_owner <> v_user then
    raise exception 'المقعد الأول مخصص لمضيف الغرفة';
  end if;

  if exists (
    select 1 from public.room_seats s
    where s.room_id = p_room_id
      and s.seat_no = p_seat_no
      and s.user_id <> v_user
  ) then
    raise exception 'هذا المقعد محجوز بالفعل';
  end if;

  delete from public.room_seats
  where room_id = p_room_id and user_id = v_user;

  insert into public.room_seats(room_id, seat_no, user_id)
  values (p_room_id, p_seat_no, v_user);

  return jsonb_build_object('success', true, 'room_id', p_room_id, 'seat_no', p_seat_no);
end;
$;

revoke all on function public.request_room_seat(uuid, integer) from public;
grant execute on function public.request_room_seat(uuid, integer) to authenticated;



-- Cosmetic ownership is server-enforced: clients may edit public profile fields,
-- but cannot write equipped item IDs directly or bypass the inventory RPC.
revoke insert, update on public.profiles from authenticated;
grant insert (id, handle, display_name, bio, country, color, avatar_url, cover_url, background_url)
  on public.profiles to authenticated;
grant update (handle, display_name, bio, country, color, avatar_url, cover_url, background_url)
  on public.profiles to authenticated;

-- RLS does not protect TRUNCATE. Client roles do not need schema-level
-- maintenance privileges such as TRUNCATE, REFERENCES, or TRIGGER.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- These functions are invoked by database triggers, not by client RPC calls.
-- Remove direct client execution while leaving the existing triggers installed.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
