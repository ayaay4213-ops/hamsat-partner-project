-- HAMSAT room seat expansion: restore the approved 12-microphone room layout.
-- Preserve existing room counts and occupied seats; new rooms default to 12 seats.
alter table public.rooms
  drop constraint if exists rooms_seat_limit_check;
alter table public.rooms
  add constraint rooms_seat_limit_check check (seat_limit between 1 and 12);
alter table public.rooms
  alter column seat_limit set default 12;

alter table public.room_seats
  drop constraint if exists room_seats_seat_no_check;
alter table public.room_seats
  add constraint room_seats_seat_no_check check (seat_no between 1 and 12);
