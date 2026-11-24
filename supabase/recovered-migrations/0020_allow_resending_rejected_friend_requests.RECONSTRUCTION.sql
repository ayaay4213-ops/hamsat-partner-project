-- RECONSTRUCTION SNAPSHOT — NOT THE ORIGINAL HISTORICAL MIGRATION.
-- Rebuilt from live production on 2026-11-24; not in active migration history.
-- This captures the current uniqueness rule: one pending/accepted request per
-- unordered pair; rejected requests do not block a later new request.
-- Do not replay on production: this index already exists there.

drop index if exists public.friend_requests_active_pair_idx;
create unique index friend_requests_active_pair_idx
  on public.friend_requests (
    least(sender_id::text, receiver_id::text),
    greatest(sender_id::text, receiver_id::text)
  )
  where status in ('pending','accepted');

-- Verification:
-- select indexdef from pg_indexes
-- where schemaname='public' and indexname='friend_requests_active_pair_idx';
