-- Grant only the client operations required by the private inbox and notifications.
-- RLS remains enabled and is the row-level boundary for every operation.
revoke all on table public.dm_conversations, public.dm_messages, public.notifications from anon;
grant select on table public.dm_conversations to authenticated;
grant select, insert on table public.dm_messages to authenticated;
grant update (read_at) on table public.dm_messages to authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
