-- Private messaging: remove broad table and column privileges and allow
-- only the columns the client actually needs. RLS remains the row-level boundary.
revoke all on table public.dm_conversations from anon, authenticated;
revoke references (id, user_a, user_b, created_at, updated_at)
  on table public.dm_conversations from anon, authenticated;
grant select on table public.dm_conversations to authenticated;

revoke all on table public.dm_messages from anon, authenticated;
revoke insert (id, conversation_id, sender_id, body, created_at, read_at)
  on table public.dm_messages from anon, authenticated;
revoke update (id, conversation_id, sender_id, body, created_at, read_at)
  on table public.dm_messages from anon, authenticated;
revoke references (id, conversation_id, sender_id, body, created_at, read_at)
  on table public.dm_messages from anon, authenticated;

grant select on table public.dm_messages to authenticated;
grant insert (conversation_id, sender_id, body)
  on table public.dm_messages to authenticated;
grant update (read_at)
  on table public.dm_messages to authenticated;
