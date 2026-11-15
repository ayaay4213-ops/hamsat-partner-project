-- Hamsat admin catalog and games foundation.
-- Review and apply manually to the intended Supabase project; this file is NOT auto-applied.

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user','admin'));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Never allow a normal client to promote itself.
revoke update (role) on public.profiles from anon, authenticated;

alter table public.shop_items
  add column if not exists description text not null default '',
  add column if not exists image_url text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.games (
  id text primary key,
  name text not null,
  description text not null default '',
  game_type text not null default 'quiz',
  icon text not null default '🎮',
  config jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_game_type_check check (game_type in ('quiz','guess','challenge','trivia','custom'))
);

alter table public.games enable row level security;
alter table public.shop_items enable row level security;

grant select on public.games to anon, authenticated;
grant insert, update, delete on public.games to authenticated;
grant select on public.shop_items to anon, authenticated;
grant insert, update, delete on public.shop_items to authenticated;

drop policy if exists "Active games are visible" on public.games;
create policy "Active games are visible"
  on public.games for select to anon, authenticated
  using (active = true or public.is_admin());

drop policy if exists "Admins manage games" on public.games;
create policy "Admins manage games"
  on public.games for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage shop catalog" on public.shop_items;
create policy "Admins manage shop catalog"
  on public.shop_items for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Active shop items are visible" on public.shop_items;
create policy "Active shop items are visible"
  on public.shop_items for select to anon, authenticated
  using (active = true or public.is_admin());
