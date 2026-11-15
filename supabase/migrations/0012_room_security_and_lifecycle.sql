-- Hamsat room security, microphone-seat authorization, and realtime lifecycle.
-- This migration was applied directly to the production project on 2026-11-15.
-- Keep this file in source control so fresh environments can reproduce the same schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_room_member(p_room_id uuid)
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
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_member(uuid) from public, anon;
grant execute on function private.is_room_member(uuid) to authenticated;

drop policy if exists "Room members can view occupants" on public.room_members;
create policy "Room members can view occupants"
  on public.room_members
  for select to authenticated
  using (private.is_room_member(room_members.room_id));

drop policy if exists "Room members read room messages" on public.room_messages;
create policy "Room members read room messages"
  on public.room_messages
  for select to authenticated
  using (private.is_room_member(room_messages.room_id));

drop policy if exists "Room members send their own messages" on public.room_messages;
create policy "Room members send their own messages"
  on public.room_messages
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and private.is_room_member(room_messages.room_id)
  );

drop policy if exists "Members can view room seats" on public.room_seats;
drop policy if exists "Room members can view microphone seats" on public.room_seats;
create policy "Room members can view microphone seats"
  on public.room_seats
  for select to authenticated
  using (private.is_room_member(room_seats.room_id));

drop policy if exists "Members can leave their own seats" on public.room_seats;
revoke insert, update, delete on public.room_seats from anon, authenticated;
grant select on public.room_seats to authenticated;

drop function if exists public.request_room_seat(uuid, smallint);
drop function if exists public.request_room_seat(uuid, integer);
create function public.request_room_seat(p_room_id uuid, p_seat_no integer)
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

  if not found then
    raise exception 'الغرفة غير موجودة';
  end if;
  if not private.is_room_member(p_room_id) then
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
$$;

revoke all on function public.request_room_seat(uuid, integer) from public, anon;
grant execute on function public.request_room_seat(uuid, integer) to authenticated;

create or replace function public.leave_room_seat(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  delete from public.room_seats
  where room_id = p_room_id and user_id = auth.uid();
  return true;
end;
$$;

revoke all on function public.leave_room_seat(uuid) from public, anon;
grant execute on function public.leave_room_seat(uuid) to authenticated;

create or replace function public.release_room_seat_after_member_exit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.room_seats
  where room_id = old.room_id and user_id = old.user_id;
  return old;
end;
$$;

revoke all on function public.release_room_seat_after_member_exit() from public, anon, authenticated;
drop trigger if exists room_member_release_seat on public.room_members;
create trigger room_member_release_seat
  after delete on public.room_members
  for each row execute function public.release_room_seat_after_member_exit();

revoke truncate, references, trigger
  on public.rooms, public.room_members, public.room_seats, public.room_messages
  from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end
$$;

-- These functions are trigger/internal helpers, not client RPC endpoints.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
