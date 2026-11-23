-- Private messaging: remove broad table privileges and allow only the columns
-- the client actually needs. RLS policies remain the row-level boundary.
revoke all on table public.dm_conversations from anon, authenticated;
grant select on table public.dm_conversations to authenticated;

revoke all on table public.dm_messages from anon, authenticated;
grant select on table public.dm_messages to authenticated;
grant insert (conversation_id, sender_id, body)
  on table public.dm_messages to authenticated;
grant update (read_at)
  on table public.dm_messages to authenticated;
