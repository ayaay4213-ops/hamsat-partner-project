alter table public.profiles
  add column if not exists age smallint check (age is null or age between 13 and 120),
  add column if not exists gender text check (gender is null or gender in ('female','male','other')),
  add column if not exists vip_level smallint not null default 0 check (vip_level between 0 and 10),
  add column if not exists wealth_level smallint not null default 1 check (wealth_level between 1 and 100),
  add column if not exists charisma_level smallint not null default 1 check (charisma_level between 1 and 100);

create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 500), image_url text,
  created_at timestamptz not null default now(),
  constraint moments_content_required check (char_length(trim(body)) > 0 or image_url is not null)
);
alter table public.moments enable row level security;
revoke all on public.moments from anon, authenticated;
grant select, insert, delete on public.moments to authenticated;
create policy "Members read moments" on public.moments for select to authenticated using (true);
create policy "Members create own moments" on public.moments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members delete own moments" on public.moments for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.couple_spaces (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','ended','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (owner_id <> partner_id)
);
create unique index if not exists couple_spaces_one_open_per_member
  on public.couple_spaces ((least(owner_id,partner_id)), (greatest(owner_id,partner_id))) where status in ('pending','active');
alter table public.couple_spaces enable row level security;
revoke all on public.couple_spaces from anon, authenticated;
grant select, insert, update on public.couple_spaces to authenticated;
create policy "Members view own couple spaces" on public.couple_spaces for select to authenticated using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));
create policy "Members invite partner" on public.couple_spaces for insert to authenticated with check (owner_id = (select auth.uid()) and status = 'pending');
create policy "Invited partner responds" on public.couple_spaces for update to authenticated using (partner_id = (select auth.uid()) and status = 'pending') with check (partner_id = (select auth.uid()) and status in ('active','rejected'));
create policy "Owner ends own couple space" on public.couple_spaces for update to authenticated using (owner_id = (select auth.uid()) and status = 'active') with check (owner_id = (select auth.uid()) and status = 'ended');

