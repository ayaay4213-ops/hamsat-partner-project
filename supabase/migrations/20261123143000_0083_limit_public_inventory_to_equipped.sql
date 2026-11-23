-- HAMSAT 0083: public profile reads may see equipped cosmetics, not purchase history.
drop policy if exists "Members can view owned cosmetics publicly" on public.user_inventory;

create policy "Members can view equipped cosmetics publicly"
on public.user_inventory
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
      from public.profiles p
     where p.id = user_inventory.user_id
       and user_inventory.item_id = any(array[
         p.equipped_frame_id,
         p.equipped_emoji_pack_id,
         p.equipped_entrance_id,
         p.equipped_bubble_id,
         p.equipped_special_id,
         p.equipped_profile_frame_id,
         p.equipped_sound_frame_id,
         p.equipped_voice_wave_id
       ]::text[])
  )
);
