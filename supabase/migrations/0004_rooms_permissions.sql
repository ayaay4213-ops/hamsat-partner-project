-- Room access for authenticated users.
-- Row Level Security remains enabled and limits inserts/deletes to each room owner.
grant select, insert, delete on table public.rooms to authenticated;
