-- Restrict room chat history to messages created after the current member joined.
-- Prepared for review only; do not apply to the live database without explicit approval.
drop policy if exists "Room members read room messages" on public.room_messages;
create policy "Room members read room messages"
  on public.room_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.room_members m
      where m.room_id = room_messages.room_id
        and m.user_id = (select auth.uid())
        and room_messages.created_at >= m.joined_at
    )
  );
