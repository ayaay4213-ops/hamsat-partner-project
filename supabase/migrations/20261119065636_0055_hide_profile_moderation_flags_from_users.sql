-- Moderation status and internal notes are not part of public profile data.
-- Keep them accessible to trusted server-side code and admins, not regular clients.
revoke select (is_banned, banned_at, ban_reason)
on table public.profiles
from authenticated, anon;
