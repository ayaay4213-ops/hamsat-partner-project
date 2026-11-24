-- RECONSTRUCTION SNAPSHOT — NOT THE ORIGINAL HISTORICAL MIGRATION.
-- Rebuilt from the live production function and trigger on 2026-11-24.
-- Kept outside active migrations; do not replay on production.

create or replace function private.guard_room_seat_limit()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.seat_limit < old.seat_limit and exists (
    select 1
      from public.room_seats s
     where s.room_id = old.id
       and s.seat_no > new.seat_limit
  ) then
    raise exception 'لا يمكن تقليل عدد الكراسي قبل إخلاء الكراسي الأعلى أولاً';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_room_seat_limit on public.rooms;
create trigger guard_room_seat_limit
before update of seat_limit on public.rooms
for each row execute function private.guard_room_seat_limit();

-- Production additionally contains a later owner-only seat-limit guard.
-- Do not replace or remove that later trigger/function when reconciling.
