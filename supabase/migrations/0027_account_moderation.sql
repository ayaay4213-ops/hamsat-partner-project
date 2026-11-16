-- HAMSAT account moderation: only the locked Super Admin may change ban state.
alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists ban_reason text;

create or replace function public.protect_profile_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.is_admin()
     and (
       new.is_banned is distinct from old.is_banned
       or new.banned_at is distinct from old.banned_at
       or new.ban_reason is distinct from old.ban_reason
     ) then
    raise exception 'لا تملكين صلاحية تغيير حالة الحظر.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_moderation_fields on public.profiles;
create trigger protect_profile_moderation_fields
before update on public.profiles
for each row execute function public.protect_profile_moderation_fields();

grant select on public.profiles to authenticated;
