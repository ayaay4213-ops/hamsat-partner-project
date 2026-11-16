-- HAMSAT post-launch hardening: close the XP event read-policy gap and index frequently joined foreign keys.
-- Safe to apply after the existing 0037-0044 migrations; no user rows are modified.

drop policy if exists "Users read own XP events" on public.xp_events;
create policy "Users read own XP events"
  on public.xp_events
  for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create index if not exists couple_spaces_owner_id_idx on public.couple_spaces(owner_id);
create index if not exists couple_spaces_partner_id_idx on public.couple_spaces(partner_id);
create index if not exists dm_messages_sender_id_idx on public.dm_messages(sender_id);
create index if not exists gift_transactions_gift_id_idx on public.gift_transactions(gift_id);
create index if not exists moments_user_id_idx on public.moments(user_id);
create index if not exists notifications_actor_id_idx on public.notifications(actor_id);
create index if not exists profile_visits_visitor_id_idx on public.profile_visits(visitor_id);
create index if not exists profiles_equipped_emoji_pack_id_idx on public.profiles(equipped_emoji_pack_id);
create index if not exists profiles_equipped_frame_id_idx on public.profiles(equipped_frame_id);
create index if not exists room_messages_user_id_idx on public.room_messages(user_id);
create index if not exists room_participant_mutes_user_id_idx on public.room_participant_mutes(user_id);
create index if not exists room_seats_user_id_idx on public.room_seats(user_id);
create index if not exists user_badges_badge_id_idx on public.user_badges(badge_id);
create index if not exists user_inventory_item_id_idx on public.user_inventory(item_id);
