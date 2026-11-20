-- HAMSAT: minimal, privacy-preserving sign-in audit trail.
-- This migration is staged in the preview branch only; do not apply to production without approval.

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  signed_in_at timestamptz not null default now(),
  constraint login_events_user_session_key unique (user_id, session_id)
);

create index if not exists login_events_user_signed_in_idx
  on public.login_events (user_id, signed_in_at desc);

alter table public.login_events enable row level security;

drop policy if exists "Members can record their own sign-ins" on public.login_events;
create policy "Members can record their own sign-ins"
  on public.login_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Only super admins can read sign-in events" on public.login_events;
create policy "Only super admins can read sign-in events"
  on public.login_events
  for select
  to authenticated
  using (public.is_admin() is true);

revoke all on public.login_events from anon;
grant insert, select on public.login_events to authenticated;

create or replace view public.admin_user_login_summary
with (security_invoker = true)
as
select
  user_id,
  count(*)::bigint as login_count,
  max(signed_in_at) as last_sign_in_at
from public.login_events
group by user_id;

revoke all on public.admin_user_login_summary from anon;
grant select on public.admin_user_login_summary to authenticated;

comment on table public.login_events is
  'Minimal sign-in audit: user id, Supabase session id, timestamp only. No phone, email, IP, or device fingerprint.';
