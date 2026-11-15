-- Security hardening for room membership policies and internal trigger functions.
-- Review and apply to Supabase only after confirming the target project and backup.

-- A single helper keeps room-membership checks consistent and avoids recursive RLS.
create or replace function public.is_room_member(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
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
      and m.user_id = p_user_id
  );
$$;

revoke all on function public.is_room_member(uuid, uuid) from public;
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


-- Serialize microphone seat allocation per room and reserve seat 1 for its owner.
-- Keep the existing smallint signature to match the currently deployed RPC.
create or replace function public.request_room_seat(
  p_room_id uuid,
  p_seat_no smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
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

  if not public.is_room_member(p_room_id, v_user) then
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

revoke all on function public.request_room_seat(uuid, smallint) from public;
grant execute on function public.request_room_seat(uuid, smallint) to authenticated;

-- These functions are invoked by database triggers, not by client RPC calls.
-- Remove direct client execution while leaving the existing triggers installed.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
