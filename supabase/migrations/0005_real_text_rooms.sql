-- Real Hamsat text rooms. Audio is intentionally not implemented here.
create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members(user_id);
alter table public.room_members enable row level security;
drop policy if exists "Room members can view occupants" on public.room_members;
create policy "Room members can view occupants" on public.room_members
  for select to authenticated using (
    exists (select 1 from public.rooms r where r.id = room_id)
  );
drop policy if exists "Users join rooms as themselves" on public.room_members;
create policy "Users join rooms as themselves" on public.room_members
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users leave rooms as themselves" on public.room_members;
create policy "Users leave rooms as themselves" on public.room_members
  for delete to authenticated using (auth.uid() = user_id);
grant select, insert, delete on public.room_members to authenticated;

create table if not exists public.room_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists room_messages_room_created_idx on public.room_messages(room_id, created_at);
alter table public.room_messages enable row level security;
drop policy if exists "Room members read room messages" on public.room_messages;
create policy "Room members read room messages" on public.room_messages
  for select to authenticated using (
    exists (select 1 from public.room_members m where m.room_id = room_id and m.user_id = auth.uid())
  );
drop policy if exists "Room members send their own messages" on public.room_messages;
create policy "Room members send their own messages" on public.room_messages
  for insert to authenticated with check (
    auth.uid() = user_id and exists (
      select 1 from public.room_members m where m.room_id = room_id and m.user_id = auth.uid()
    )
  );
grant select, insert on public.room_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_messages'
  ) then
    alter publication supabase_realtime add table public.room_messages;
  end if;
end $$;
