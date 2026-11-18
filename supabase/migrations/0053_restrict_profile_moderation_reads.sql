-- Keep profile fields needed by the app readable, but hide moderation metadata.
-- The admin screen only needs is_banned; it does not read ban_reason or banned_at.

revoke select on table public.profiles from authenticated;

grant select (
  id,
  handle,
  display_name,
  bio,
  country,
  avatar_url,
  created_at,
  updated_at,
  color,
  equipped_frame_id,
  equipped_emoji_pack_id,
  cover_url,
  background_url,
  role,
  public_id,
  is_banned,
  age,
  gender,
  vip_level,
  wealth_level,
  charisma_level,
  equipped_entrance_id,
  equipped_bubble_id,
  equipped_special_id,
  equipped_profile_frame_id,
  equipped_sound_frame_id,
  equipped_voice_wave_id
) on table public.profiles to authenticated;
