-- Only verified, non-anonymous, non-banned accounts may enter public voice rooms.
-- This is an admission check, not an automated "fake account" classifier.
create or replace function public.join_room_presence(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  -- Keep the one-room rule safe when two devices join at nearly the same time.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if not exists (
    select 1
      from auth.users u
      join public.profiles p on p.id = u.id
     where u.id = v_user
       and not coalesce(u.is_anonymous, false)
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
       and u.deleted_at is null
       and (u.banned_until is null or u.banned_until <= now())
       and not coalesce(p.is_banned, false)
  ) then
    raise exception 'يجب توثيق وسيلة الاتصال للحساب قبل دخول الغرف';
  end if;

  if not exists (select 1 from public.rooms where id = p_room_id) then
    raise exception 'الغرفة غير موجودة';
  end if;

  delete from public.room_seats
   where user_id = v_user
     and room_id <> p_room_id;

  delete from public.room_members
   where user_id = v_user
     and room_id <> p_room_id;

  insert into public.room_members (room_id, user_id, last_seen_at)
  values (p_room_id, v_user, now())
  on conflict (room_id, user_id)
  do update set last_seen_at = excluded.last_seen_at;

  return true;
end;
$$;

revoke all on function public.join_room_presence(uuid) from public, anon;
grant execute on function public.join_room_presence(uuid) to authenticated;
