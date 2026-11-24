-- RECONSTRUCTION SNAPSHOT — NOT THE ORIGINAL HISTORICAL MIGRATION.
-- Rebuilt from live production security objects on 2026-11-24.
-- No privileged owner UUID is copied into this recovery artifact.
-- The production public.is_admin() helper is owner-pinned and must be reviewed
-- from the secured source before adapting this snapshot to another environment.
-- Kept outside active migrations; do not replay on production.

create table if not exists public.staff_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  permissions text[] not null default '{}',
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_roles_allowed_permissions
    check (permissions <@ array[
      'room_moderation','report_review','member_support','event_management'
    ]::text[])
);

alter table public.staff_roles enable row level security;

drop policy if exists "Only Super Admin manages staff roles" on public.staff_roles;
create policy "Only Super Admin manages staff roles"
  on public.staff_roles for all to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

drop policy if exists "Staff can view own role" on public.staff_roles;
create policy "Staff can view own role"
  on public.staff_roles for select to authenticated
  using (user_id = (select auth.uid()) or coalesce(public.is_admin(), false));

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.role := 'user';
    elsif not public.is_admin() then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'Profile role changes are restricted to the service role.';
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
before insert or update of role on public.profiles
for each row execute function public.guard_profile_role();

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before update of role on public.profiles
for each row execute function public.prevent_self_role_escalation();

-- Do not expose staff_roles writes to clients through broad table grants.
-- Current production grants were hardened in later security migrations.
