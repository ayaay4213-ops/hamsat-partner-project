-- HAMSAT 0092: disable legacy gift RPC overloads without stable request IDs.
-- The current client always supplies p_request_id and uses the 4-argument overloads.
-- Leaving the 3-argument compatibility wrappers executable lets older clients
-- generate a fresh UUID per retry and bypass the idempotency ledger.
revoke all on function public.send_gift(uuid, text, integer)
  from public, anon, authenticated;

revoke all on function public.send_room_gift(uuid, uuid, text, integer)
  from public, anon, authenticated;

revoke all on function public.send_room_gift_to_all(uuid, text, integer)
  from public, anon, authenticated;

-- Keep the idempotent overloads available only to authenticated clients.
revoke all on function public.send_gift(uuid, text, integer, uuid)
  from public, anon;
grant execute on function public.send_gift(uuid, text, integer, uuid)
  to authenticated;

revoke all on function public.send_room_gift(uuid, uuid, text, integer, uuid)
  from public, anon;
grant execute on function public.send_room_gift(uuid, uuid, text, integer, uuid)
  to authenticated;

revoke all on function public.send_room_gift_to_all(uuid, text, integer, uuid)
  from public, anon;
grant execute on function public.send_room_gift_to_all(uuid, text, integer, uuid)
  to authenticated;
