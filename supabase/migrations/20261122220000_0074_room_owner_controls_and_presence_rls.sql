-- Restrict room admission and shared-background changes to their intended RPC/owner paths.
-- This migration is reviewed but must be applied only after explicit approval.

create or replace function private.is_room_owner(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.rooms r
     where r.id = p_room_id
       and r.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_owner(uuid) from public, anon;
grant execute on function private.is_room_owner(uuid) to authenticated;

-- Room membership must be created by the atomic, verified join RPC.
drop policy if exists "Users join rooms as themselves" on public.room_members;

-- Room creation must pass through create_owned_room, which enforces the one-room limit.
drop policy if exists "Users create their own rooms" on public.rooms;

-- Only the room owner may choose or remove the shared room background.
drop policy if exists "Room members set shared background" on public.room_backgrounds;
drop policy if exists "Room members update shared background" on public.room_backgrounds;
drop policy if exists "Room members remove shared background" on public.room_backgrounds;

create policy "Room owners set shared background"
  on public.room_backgrounds
  for insert
  to authenticated
  with check (
    auth.uid() = updated_by
    and private.is_room_owner(room_id)
  );

create policy "Room owners update shared background"
  on public.room_backgrounds
  for update
  to authenticated
  using (private.is_room_owner(room_id))
  with check (
    auth.uid() = updated_by
    and private.is_room_owner(room_id)
  );

create policy "Room owners remove shared background"
  on public.room_backgrounds
  for delete
  to authenticated
  using (private.is_room_owner(room_id));
