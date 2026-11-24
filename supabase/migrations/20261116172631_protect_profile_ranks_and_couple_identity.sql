create or replace function public.protect_profile_moderation_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null
     and not public.is_admin()
     and (
       new.role is distinct from old.role
       or new.is_banned is distinct from old.is_banned
       or new.banned_at is distinct from old.banned_at
       or new.ban_reason is distinct from old.ban_reason
       or new.vip_level is distinct from old.vip_level
       or new.wealth_level is distinct from old.wealth_level
       or new.charisma_level is distinct from old.charisma_level
     ) then
    raise exception 'لا تملكين صلاحية تغيير الرتبة أو مستويات العضوية.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_moderation_fields() from public, anon, authenticated;

revoke update on public.couple_spaces from authenticated;
grant update(status,updated_at) on public.couple_spaces to authenticated;
