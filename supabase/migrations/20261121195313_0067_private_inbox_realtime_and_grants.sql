-- Keep both participants' inbox lists synchronized when a conversation receives a new message.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='dm_conversations'
  ) then
    alter publication supabase_realtime add table public.dm_conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end $$;

-- Explicit client privileges; row-level policies still restrict access to the two participants.
grant select on public.dm_conversations to authenticated;
grant select, insert on public.dm_messages to authenticated;
grant update (read_at) on public.dm_messages to authenticated;
