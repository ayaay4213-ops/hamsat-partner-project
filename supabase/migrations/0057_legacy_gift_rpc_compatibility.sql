-- Preserve compatibility with the currently published HAMSAT client.
-- The live client still calls the three-argument direct-gift RPC.
-- The wrapper delegates to the idempotent implementation with a fresh request UUID.
create or replace function public.send_gift(
  p_recipient uuid,
  p_gift_id text,
  p_quantity integer
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select public.send_gift(p_recipient,p_gift_id,p_quantity,gen_random_uuid());
$$;

revoke all on function public.send_gift(uuid,text,integer) from public,anon;
grant execute on function public.send_gift(uuid,text,integer) to authenticated;
