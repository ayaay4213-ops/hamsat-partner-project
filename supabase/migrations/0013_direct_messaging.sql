-- Hamsat direct messaging foundation: private conversations, RLS, and realtime.
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_distinct_users check (user_a <> user_b),
  constraint dm_user_order check (user_a < user_b),
  constraint dm_pair_unique unique (user_a,user_b)
);
create index if not exists dm_conversations_user_a_idx on public.dm_conversations(user_a,updated_at desc);
create index if not exists dm_conversations_user_b_idx on public.dm_conversations(user_b,updated_at desc);
alter table public.dm_conversations enable row level security;
drop policy if exists "Participants read their conversations" on public.dm_conversations;
create policy "Participants read their conversations" on public.dm_conversations
for select to authenticated using (auth.uid() = user_a or auth.uid() = user_b);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists dm_messages_conversation_created_idx on public.dm_messages(conversation_id,created_at);
alter table public.dm_messages enable row level security;
drop policy if exists "Participants read direct messages" on public.dm_messages;
create policy "Participants read direct messages" on public.dm_messages
for select to authenticated using (exists (
  select 1 from public.dm_conversations c where c.id=conversation_id
  and (c.user_a=auth.uid() or c.user_b=auth.uid())
));
drop policy if exists "Participants send direct messages" on public.dm_messages;
create policy "Participants send direct messages" on public.dm_messages
for insert to authenticated with check (
  sender_id=auth.uid() and exists (
    select 1 from public.dm_conversations c where c.id=conversation_id
    and (c.user_a=auth.uid() or c.user_b=auth.uid())
  )
);
drop policy if exists "Recipients mark direct messages read" on public.dm_messages;
create policy "Recipients mark direct messages read" on public.dm_messages
for update to authenticated using (
  sender_id <> auth.uid() and exists (
    select 1 from public.dm_conversations c where c.id=conversation_id
    and (c.user_a=auth.uid() or c.user_b=auth.uid())
  )
) with check (sender_id <> auth.uid());

create or replace function public.get_or_create_conversation(p_other_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
begin
  if v_me is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_other_user is null or p_other_user=v_me then raise exception 'اختاري عضواً آخر للمراسلة'; end if;
  if not exists(select 1 from public.profiles where id=p_other_user) then raise exception 'المستخدم غير موجود'; end if;
  if v_me < p_other_user then v_a:=v_me;v_b:=p_other_user; else v_a:=p_other_user;v_b:=v_me; end if;
  insert into public.dm_conversations(user_a,user_b) values(v_a,v_b)
  on conflict(user_a,user_b) do update set updated_at=public.dm_conversations.updated_at
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.get_or_create_conversation(uuid) from public,anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

create or replace function public.bump_dm_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin update public.dm_conversations set updated_at=new.created_at where id=new.conversation_id; return new; end $$;
revoke all on function public.bump_dm_conversation() from public,anon,authenticated;
drop trigger if exists dm_message_bump_conversation on public.dm_messages;
create trigger dm_message_bump_conversation after insert on public.dm_messages
for each row execute function public.bump_dm_conversation();

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dm_messages') then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end $$;
