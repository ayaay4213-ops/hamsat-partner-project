-- Keep the public RPC name used by the client as a thin, non-privileged wrapper.
-- The private SECURITY DEFINER helper owns participant, self-target and block checks.
-- Production already uses this wrapper shape; do not duplicate privileged logic here.
create or replace function public.get_or_create_conversation(p_other_user uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.get_or_create_conversation(p_other_user);
$function$;

revoke all on function public.get_or_create_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
