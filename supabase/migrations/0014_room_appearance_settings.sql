-- Owner-managed room appearance: room background and room identity emoji.
alter table public.rooms add column if not exists room_emoji text not null default '🎙️';
alter table public.rooms drop constraint if exists rooms_room_emoji_length;
alter table public.rooms add constraint rooms_room_emoji_length check (char_length(room_emoji) between 1 and 8);
drop policy if exists "Owners update their own rooms" on public.rooms;
create policy "Owners update their own rooms" on public.rooms for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
grant update (title, topic, description, cover_url, room_emoji) on public.rooms to authenticated;
