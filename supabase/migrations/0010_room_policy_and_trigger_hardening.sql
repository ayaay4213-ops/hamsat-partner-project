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

-- These functions are invoked by database triggers, not by client RPC calls.
-- Remove direct client execution while leaving the existing triggers installed.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
