-- Enforce the product rule: each member may own at most one room.
-- Refuse to apply if legacy duplicate rooms need manual review; never delete rooms automatically.
do $$
begin
  if exists (
    select 1
    from public.rooms
    where owner_id is not null
    group by owner_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one room per member: duplicate owned rooms already exist. Review them before applying migration 0060.';
  end if;
end;
$$;

create unique index if not exists rooms_one_owned_room_per_member_idx
  on public.rooms(owner_id)
  where owner_id is not null;
