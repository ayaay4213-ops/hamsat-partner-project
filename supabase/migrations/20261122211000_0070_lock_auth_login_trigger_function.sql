-- This SECURITY DEFINER routine is an Auth trigger only, not a client RPC.
-- Keep the Auth trigger intact while removing unnecessary API execute grants.
revoke all on function public.capture_auth_login_event() from public, anon, authenticated;
