-- Allow only the server-side service role to read the fields required by
-- the authenticated Super Admin directory and account moderation functions.
-- Regular authenticated and anonymous clients remain unable to read moderation flags.
grant select (id, public_id, display_name, handle, role, created_at, is_banned)
  on public.profiles to service_role;

grant update (is_banned, banned_at, ban_reason)
  on public.profiles to service_role;
