-- RECONSTRUCTION SNAPSHOT — NOT THE ORIGINAL HISTORICAL MIGRATION.
-- Rebuilt from live production on 2026-11-24; kept outside active migrations.
-- Do not replay on production: this table, indexes, and policies already exist.

create table if not exists public.room_participant_mutes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_participant_mutes_user_id_idx
  on public.room_participant_mutes(user_id);

alter table public.room_participant_mutes enable row level security;

drop policy if exists "Room hosts view participant mutes" on public.room_participant_mutes;
create policy "Room hosts view participant mutes"
  on public.room_participant_mutes for select to authenticated
  using (exists (
    select 1 from public.rooms r
     where r.id = room_participant_mutes.room_id
       and r.owner_id = (select auth.uid())
  ));

drop policy if exists "Room hosts add participant mutes" on public.room_participant_mutes;
create policy "Room hosts add participant mutes"
  on public.room_participant_mutes for insert to authenticated
  with check (exists (
    select 1 from public.rooms r
     where r.id = room_participant_mutes.room_id
       and r.owner_id = (select auth.uid())
  ));

drop policy if exists "Room hosts update participant mutes" on public.room_participant_mutes;
create policy "Room hosts update participant mutes"
  on public.room_participant_mutes for update to authenticated
  using (exists (
    select 1 from public.rooms r
     where r.id = room_participant_mutes.room_id
       and r.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.rooms r
     where r.id = room_participant_mutes.room_id
       and r.owner_id = (select auth.uid())
  ));

drop policy if exists "Room hosts remove participant mutes" on public.room_participant_mutes;
create policy "Room hosts remove participant mutes"
  on public.room_participant_mutes for delete to authenticated
  using (exists (
    select 1 from public.rooms r
     where r.id = room_participant_mutes.room_id
       and r.owner_id = (select auth.uid())
  ));
