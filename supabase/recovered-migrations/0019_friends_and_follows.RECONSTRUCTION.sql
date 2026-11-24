-- RECONSTRUCTION SNAPSHOT — NOT THE ORIGINAL HISTORICAL MIGRATION.
-- Rebuilt from the live Hamsat production schema on 2026-11-24.
-- Stored outside supabase/migrations intentionally. Do not replay on production.
-- Later migrations changed grants/indexes/policies; review the current migration
-- chain before adapting this for a fresh database.

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_no_self check (sender_id <> receiver_id)
);

create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint user_follows_no_self check (follower_id <> followed_id)
);

create index if not exists friend_requests_sender_status_idx
  on public.friend_requests(sender_id, status, created_at desc);
create index if not exists friend_requests_receiver_status_idx
  on public.friend_requests(receiver_id, status, created_at desc);
create index if not exists user_follows_followed_idx
  on public.user_follows(followed_id);

alter table public.friend_requests enable row level security;
alter table public.user_follows enable row level security;

drop policy if exists "Participants can view friend requests" on public.friend_requests;
create policy "Participants can view friend requests"
  on public.friend_requests for select to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests"
  on public.friend_requests for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and status = 'pending'
    and not private.is_user_blocked(sender_id, receiver_id)
  );

drop policy if exists "Receivers can respond to friend requests" on public.friend_requests;
create policy "Receivers can respond to friend requests"
  on public.friend_requests for update to authenticated
  using (
    (select auth.uid()) = receiver_id
    and status = 'pending'
    and not private.is_user_blocked(sender_id, receiver_id)
  )
  with check (
    (select auth.uid()) = receiver_id
    and status in ('accepted','rejected')
    and not private.is_user_blocked(sender_id, receiver_id)
  );

drop policy if exists "Users can view follow relationships" on public.user_follows;
create policy "Users can view follow relationships"
  on public.user_follows for select to authenticated using (true);

drop policy if exists "Users can follow as themselves" on public.user_follows;
create policy "Users can follow as themselves"
  on public.user_follows for insert to authenticated
  with check (
    (select auth.uid()) = follower_id
    and not private.is_user_blocked(follower_id, followed_id)
  );

drop policy if exists "Users can unfollow as themselves" on public.user_follows;
create policy "Users can unfollow as themselves"
  on public.user_follows for delete to authenticated
  using ((select auth.uid()) = follower_id);

-- The production grants were subsequently hardened by later migrations.
-- Do not copy broad GRANT statements from older drafts into this snapshot.
