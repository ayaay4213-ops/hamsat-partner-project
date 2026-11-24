-- RECONSTRUCTION SNAPSHOT — NOT THE ORIGINAL HISTORICAL MIGRATION.
-- Rebuilt from live production security objects on 2026-11-24.
-- This file captures the profile role-escalation guards only.
-- staff_roles was introduced by a later migration (0062), so it is deliberately
-- excluded here. Current staff_roles has RLS enabled and no client row policies.
-- Kept outside supabase/migrations; do not replay on production.

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

-- The owner check in public.is_admin() is already owner-pinned in production.
-- Do not copy the owner UUID into this artifact or replace that helper without
-- reviewing the protected source. This snapshot is not a portable deployment.
