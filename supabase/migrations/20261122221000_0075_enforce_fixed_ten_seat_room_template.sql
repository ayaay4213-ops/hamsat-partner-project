-- Enforce the approved HAMSAT room template at the database layer.
-- Every room uses ten seats and the fixed reference layout; the background remains configurable.

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
