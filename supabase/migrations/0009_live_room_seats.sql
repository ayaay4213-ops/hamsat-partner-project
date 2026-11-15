-- Live room microphone seats for Hamsat.
-- Run after 0001..0008 in Supabase SQL Editor before enabling live audio.

create table if not exists public.room_seats (
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat_no integer not null check (seat_no between 1 and 8),
  user_id uuid not null references auth.users(id) on delete cascade,
  seated_at timestamptz not null default now(),
  primary key (room_id, seat_no),
  unique (room_id, user_id)
);

-- Membership helper avoids recursive RLS checks on room_members.
create or replace function public.is_room_member(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1
      from public.room_members m
     where m.room_id = p_room_id
       and m.user_id = p_user_id
  );
$;

revoke all on function public.is_room_member(uuid, uuid) from public;
grant execute on function public.is_room_member(uuid, uuid) to authenticated;

-- A signed-in user can see occupants only after joining that same room.
drop policy if exists "Room members can view occupants" on public.room_members;
create policy "Room members can view occupants"
  on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

-- Correctly scope message insertion to the room being written to.
drop policy if exists "Room members send their own messages" on public.room_messages;
create policy "Room members send their own messages"
  on public.room_messages for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.is_room_member(room_messages.room_id)
  );

create index if not exists room_seats_user_idx
  on public.room_seats(user_id);

alter table public.room_seats enable row level security;

drop policy if exists "Room members can view microphone seats" on public.room_seats;
create policy "Room members can view microphone seats"
  on public.room_seats for select to authenticated
  using (public.is_room_member(room_seats.room_id));

grant select on public.room_seats to authenticated;
revoke insert, update, delete on public.room_seats from anon, authenticated;

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

  if p_seat_no is null or p_seat_no < 1 or p_seat_no > 8 then
    raise exception 'رقم مقعد المايك غير صالح';
  end if;

  -- Serialize seat changes within a room to avoid double-booking races.
  select r.owner_id into v_owner
    from public.rooms r
   where r.id = p_room_id
   for update;

  if v_owner is null then
    raise exception 'الغرفة غير موجودة';
  end if;

  if not exists (
    select 1 from public.room_members m
     where m.room_id = p_room_id and m.user_id = v_user
  ) then
    raise exception 'انضمي إلى الغرفة أولاً قبل حجز المايك';
  end if;

  -- Seat 1 is reserved for the room owner/host.
  if p_seat_no = 1 and v_owner <> v_user then
    raise exception 'المقعد الأول مخصص لمضيف الغرفة';
  end if;

  if exists (
    select 1 from public.room_seats s
     where s.room_id = p_room_id and s.seat_no = p_seat_no
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

create or replace function public.leave_room_seat(p_room_id uuid)
returns jsonb
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
   where room_id = p_room_id and user_id = v_user;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.request_room_seat(uuid, integer) from public;
grant execute on function public.request_room_seat(uuid, integer) to authenticated;
revoke all on function public.leave_room_seat(uuid) from public;
grant execute on function public.leave_room_seat(uuid) to authenticated;

-- Free the microphone automatically if a member is removed from a room.
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

drop trigger if exists room_member_release_seat on public.room_members;
create trigger room_member_release_seat
  after delete on public.room_members
  for each row execute function public.release_room_seat_after_member_exit();

-- Keep the room UI synchronized when members or seats change.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'room_seats'
  ) then
    alter publication supabase_realtime add table public.room_seats;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end
$$;
