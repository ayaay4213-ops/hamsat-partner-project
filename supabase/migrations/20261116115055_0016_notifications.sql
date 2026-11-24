-- Hamsat in-app notifications for private messages and gifts.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check(type in ('message','gift','system')),
  title text not null,
  body text not null default '',
  target_url text not null default '#/home',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
for select to authenticated using(recipient_id=auth.uid());
revoke update on public.notifications from anon,authenticated;
grant update(read_at) on public.notifications to authenticated;
drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications
for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());

create or replace function public.notify_dm_recipient()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_sender_name text;
begin
  select case when c.user_a=new.sender_id then c.user_b else c.user_a end into v_recipient
  from public.dm_conversations c where c.id=new.conversation_id;
  select coalesce(nullif(p.display_name,''),p.handle,'عضو') into v_sender_name
  from public.profiles p where p.id=new.sender_id;
  if v_recipient is not null then
    insert into public.notifications(recipient_id,actor_id,type,title,body,target_url)
    values(v_recipient,new.sender_id,'message','رسالة جديدة من '||coalesce(v_sender_name,'عضو'),left(new.body,120),'#/dm/'||new.conversation_id::text);
  end if;
  return new;
end $$;
revoke all on function public.notify_dm_recipient() from public,anon,authenticated;
drop trigger if exists dm_message_notification on public.dm_messages;
create trigger dm_message_notification after insert on public.dm_messages
for each row execute function public.notify_dm_recipient();

create or replace function public.notify_gift_recipient()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text; v_gift text;
begin
  select coalesce(nullif(p.display_name,''),p.handle,'عضو') into v_name from public.profiles p where p.id=new.sender_id;
  select g.name into v_gift from public.gifts g where g.id=new.gift_id;
  insert into public.notifications(recipient_id,actor_id,type,title,body,target_url)
  values(new.recipient_id,new.sender_id,'gift','هدية جديدة من '||coalesce(v_name,'عضو'),coalesce(v_gift,'هدية')||' × '||new.quantity,'#/wallet');
  return new;
end $$;
revoke all on function public.notify_gift_recipient() from public,anon,authenticated;
drop trigger if exists gift_transaction_notification on public.gift_transactions;
create trigger gift_transaction_notification after insert on public.gift_transactions
for each row execute function public.notify_gift_recipient();

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
  alter publication supabase_realtime add table public.notifications;
 end if;
end $$;
