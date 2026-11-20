-- HAMSAT: store custom room microphone backgrounds separately from catalog item IDs.
-- Prepared on the development branch only. Review and approve before applying to live Supabase.
alter table public.rooms
  add column if not exists background_url text;

comment on column public.rooms.background_url is
  'Owner-selected custom room microphone background URL; shared by every room member.';

grant update (background_url) on public.rooms to authenticated;
