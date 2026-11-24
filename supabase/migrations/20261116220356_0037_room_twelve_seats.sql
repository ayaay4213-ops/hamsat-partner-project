-- HAMSAT: expand voice rooms to support up to twelve microphone seats.
-- Existing rooms and occupied seats are preserved; the host remains reserved to seat 1.

alter table public.rooms
  drop constraint if exists rooms_seat_limit_check;
alter table public.rooms
  add constraint rooms_seat_limit_check
  check (seat_limit = any (array[4,6,8,10,12]));

alter table public.room_seats
  drop constraint if exists room_seats_seat_no_check;
alter table public.room_seats
  add constraint room_seats_seat_no_check
  check (seat_no between 1 and 12);

create or replace function public.request_room_seat(p_room_id uuid, p_seat_no integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_owner uuid;
  v_limit integer;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if p_room_id is null or p_seat_no is null or p_seat_no < 1 then
    raise exception 'رقم مقعد المايك غير صالح';
  end if;

  select r.owner_id, r.seat_limit
    into v_owner, v_limit
    from public.rooms r
   where r.id = p_room_id
   for update;

  if not found then
    raise exception 'الغرفة غير موجودة';
  end if;
  if p_seat_no > v_limit then
    raise exception 'هذا المقعد غير متاح في إعدادات الغرفة';
  end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'انضمي إلى الغرفة أولاً قبل حجز المايك';
  end if;
  if p_seat_no = 1 and v_owner <> v_user then
    raise exception 'المقعد الأول مخصص لمضيف الغرفة';
  end if;
  if exists (
    select 1
      from public.room_seats s
     where s.room_id = p_room_id
       and s.seat_no = p_seat_no
       and s.user_id <> v_user
  ) then
    raise exception 'هذا المقعد محجوز بالفعل';
  end if;

  delete from public.room_seats
   where room_id = p_room_id
     and user_id = v_user;

  insert into public.room_seats(room_id, seat_no, user_id)
  values (p_room_id, p_seat_no, v_user);

  return jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'seat_no', p_seat_no
  );
end;
$$;

revoke all on function public.request_room_seat(uuid, integer) from public, anon;
grant execute on function public.request_room_seat(uuid, integer) to authenticated;
