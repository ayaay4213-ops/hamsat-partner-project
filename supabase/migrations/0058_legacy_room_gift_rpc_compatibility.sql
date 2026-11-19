-- Preserve compatibility with the currently published HAMSAT room-gift client.
-- Old calls receive a fresh idempotency key and delegate to the hardened RPCs.
create or replace function public.send_room_gift(
  p_room_id uuid,
  p_recipient uuid,
  p_gift_id text,
  p_quantity integer default 1
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select public.send_room_gift(p_room_id,p_recipient,p_gift_id,p_quantity,gen_random_uuid());
$$;

create or replace function public.send_room_gift_to_all(
  p_room_id uuid,
  p_gift_id text,
  p_quantity integer default 1
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select public.send_room_gift_to_all(p_room_id,p_gift_id,p_quantity,gen_random_uuid());
$$;

revoke all on function public.send_room_gift(uuid,uuid,text,integer) from public,anon;
revoke all on function public.send_room_gift_to_all(uuid,text,integer) from public,anon;
grant execute on function public.send_room_gift(uuid,uuid,text,integer) to authenticated;
grant execute on function public.send_room_gift_to_all(uuid,text,integer) to authenticated;
