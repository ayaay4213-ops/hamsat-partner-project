-- HAMSAT room backgrounds: catalog ownership and room-level selection.
-- This migration is committed to the development branch only; it is not applied here.

alter table public.shop_items
  drop constraint if exists shop_items_item_type_check;

alter table public.shop_items
  add constraint shop_items_item_type_check
  check (item_type in (
    'frame',
    'emoji_pack',
    'entrance',
    'sound_frame',
    'voice_wave',
    'profile_frame',
    'chat_bubble',
    'special_id',
    'room_background'
  ));

alter table public.rooms
  add column if not exists background_item_id text
  references public.shop_items(id) on delete set null;

-- Owners may select only a currently active room-background item that they own.
-- Custom uploaded cover_url backgrounds remain supported independently.
create or replace function private.validate_room_background_selection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.background_item_id is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.shop_items s
      join public.user_inventory i
        on i.item_id = s.id
       and i.user_id = new.owner_id
     where s.id = new.background_item_id
       and s.item_type = 'room_background'
       and s.active = true
       and (i.expires_at is null or i.expires_at > now())
  ) then
    raise exception 'يجب امتلاك خلفية غرفة صالحة قبل تطبيقها';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_room_background_selection() from public, anon, authenticated;

drop trigger if exists validate_room_background_selection on public.rooms;
create trigger validate_room_background_selection
  before insert or update of background_item_id, owner_id
  on public.rooms
  for each row
  execute function private.validate_room_background_selection();

-- Preserve the existing owner-only room update policy and grant only this new column.
grant update (background_item_id) on public.rooms to authenticated;
