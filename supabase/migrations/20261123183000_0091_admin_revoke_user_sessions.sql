-- HAMSAT 0091: revoke a target user's refreshable Auth sessions safely.
-- This RPC is service-role-only and is called only after the Edge Function
-- authenticates the super-admin and validates the target account.
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'غير مخوّل بإنهاء جلسات الحسابات'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'معرّف الحساب مطلوب'
      using errcode = '22004';
  end if;

  delete from auth.sessions
   where user_id = p_user_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.admin_revoke_user_sessions(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid)
  to service_role;
