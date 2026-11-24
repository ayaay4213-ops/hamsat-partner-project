-- Keep authentication email addresses out of public profile data.
-- Public profiles expose only the columns used by HAMSAT screens/admin UI.
update public.profiles
set handle = 'member' || public_id::text
where handle is not null
  and handle ~* '(@|gmail[.]com$|yahoo[.]com$|hotmail[.]com$|outlook[.]com$|icloud[.]com$)';

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_handle_not_email_check'
  ) then
    alter table public.profiles
      add constraint profiles_handle_not_email_check
      check (
        handle is null
        or handle !~* '(@|gmail[.]com$|yahoo[.]com$|hotmail[.]com$|outlook[.]com$|icloud[.]com$)'
      );
  end if;
end;
$migration$;

revoke select on table public.profiles from public, anon, authenticated;
grant select (
  id, public_id, handle, display_name, bio, country, age, gender, role,
  vip_level, wealth_level, charisma_level, color, avatar_url, cover_url,
  background_url, equipped_frame_id, equipped_emoji_pack_id,
  equipped_entrance_id, equipped_bubble_id, equipped_special_id,
  equipped_profile_frame_id, equipped_sound_frame_id, equipped_voice_wave_id,
  created_at, is_banned
) on table public.profiles to authenticated;
