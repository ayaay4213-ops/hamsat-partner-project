-- Aggregate-only room occupancy for the public Party lobby.
-- Never returns member IDs or other participant-level data.
create or replace function public.get_public_room_presence()
returns table (room_id uuid, active_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.room_id,
    count(*)::integer as active_count
  from public.room_members as m
  join public.rooms as r on r.id = m.room_id
  where m.last_seen_at >= now() - interval '180 seconds'
    and auth.uid() is not null
  group by m.room_id;
$$;

revoke all on function public.get_public_room_presence() from public;
revoke all on function public.get_public_room_presence() from anon;
grant execute on function public.get_public_room_presence() to authenticated;

comment on function public.get_public_room_presence() is
'Returns aggregate active room occupancy only; never exposes room member identities. Authenticated HAMSAT lobby use.';
