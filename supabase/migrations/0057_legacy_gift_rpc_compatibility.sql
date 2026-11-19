-- Preserve compatibility with the currently published HAMSAT client.
-- The live client still calls the three-argument direct-gift RPC, whose quantity
-- parameter historically defaulted to 1. Delegate to the idempotent implementation.
create or replace function public.send_gift(
  p_recipient uuid,
  p_gift_id text,
  p_quantity integer default 1
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
