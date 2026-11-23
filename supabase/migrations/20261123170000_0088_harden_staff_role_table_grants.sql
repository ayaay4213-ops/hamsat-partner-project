-- Tighten direct table privileges for the staff-role subsystem.
-- All mutations must pass through the SECURITY DEFINER assignment/review RPCs.
revoke all on table public.staff_roles, public.staff_audit_log from anon, authenticated;
grant select on table public.staff_roles, public.staff_audit_log to authenticated;

revoke all on function public.assign_staff_permissions(uuid, text[], boolean) from public, anon;
grant execute on function public.assign_staff_permissions(uuid, text[], boolean) to authenticated;

revoke all on function public.has_staff_permission(text) from public, anon;
grant execute on function public.has_staff_permission(text) to authenticated;

revoke all on function public.staff_update_user_report(bigint, text, text) from public, anon;
grant execute on function public.staff_update_user_report(bigint, text, text) to authenticated;
