-- ARCHIVED: Production effect reconciled by applied migration 20261124122300 (HAMSAT 0079).
-- This file is preserved for audit/reference only and must not be moved back into active migrations.

-- This SECURITY DEFINER routine is an Auth trigger only, not a client RPC.
-- Keep the Auth trigger intact while removing unnecessary API execute grants.
revoke all on function public.capture_auth_login_event() from public, anon, authenticated;
