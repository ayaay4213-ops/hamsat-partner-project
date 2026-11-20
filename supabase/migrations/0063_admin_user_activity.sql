-- Expose only account timestamps to authenticated Super Admins.
-- Never return email addresses, phone numbers, or IP addresses.
create or replace function public.admin_user_activity(p_user_ids uuid[])
returns table (
  user_id uuid,
  account_created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select u.id, u.created_at, u.last_sign_in_at
  from auth.users as u
  where u.id = any(coalesce(p_user_ids, array[]::uuid[]));
end;
$function$;

revoke all on function public.admin_user_activity(uuid[]) from public;
grant execute on function public.admin_user_activity(uuid[]) to authenticated;
