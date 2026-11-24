-- Upgrade rooms that used the previous standard capacity to the new ten-seat stage.
update public.rooms set seat_limit = 10 where seat_limit = 8;
