-- Enforce the approved HAMSAT room template at the database layer.
-- Every room uses ten seats and the fixed reference layout; the background remains configurable.

-- Match the database default to the approved template so new rooms never inherit the old eight-seat default.
alter table public.rooms alter column seat_limit set default 10;

alter table public.rooms
  add constraint rooms_reference_layout_fixed_check
  check (seat_limit = 10 and seat_layout = 'grid') not valid;

alter table public.rooms
  validate constraint rooms_reference_layout_fixed_check;

alter table public.room_seats
  add constraint room_seats_reference_range_check
  check (seat_no between 1 and 10) not valid;

alter table public.room_seats
  validate constraint room_seats_reference_range_check;
