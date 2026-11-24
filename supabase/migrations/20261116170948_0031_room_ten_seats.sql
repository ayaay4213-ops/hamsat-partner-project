alter table public.rooms drop constraint if exists rooms_seat_limit_check;
alter table public.rooms add constraint rooms_seat_limit_check check (seat_limit = any (array[4,6,8,10]));
