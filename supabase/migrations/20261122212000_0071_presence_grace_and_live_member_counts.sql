-- Mobile browsers can throttle background timers; allow a safer presence grace period.
-- Explicit leave remains immediate through leave_room_presence.
create or replace function public.cleanup_stale_room_presence(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  if not private.is_room_member(p_room_id) then
    raise exception 'يجب أن تكوني عضوة في الغرفة';
  end if;

  with stale as materialized (
    select user_id
      from public.room_members
     where room_id = p_room_id
       and last_seen_at < now() - interval '180 seconds'
  ),
  deleted_seats as (
    delete from public.room_seats s
     using stale x
     where s.room_id = p_room_id
       and s.user_id = x.user_id
    returning s.user_id
  ),
  deleted_members as (
    delete from public.room_members m
     using stale x
     where m.room_id = p_room_id
       and m.user_id = x.user_id
    returning m.user_id
  )
  select count(*)::integer into v_deleted from deleted_members;

  -- Also remove orphan seats left by older client versions or interrupted exits.
  delete from public.room_seats s
   where s.room_id = p_room_id
     and not exists (
       select 1 from public.room_members m
        where m.room_id = s.room_id
          and m.user_id = s.user_id
     );

  return v_deleted;
end;
$$;

create or replace function public.get_public_room_member_counts(p_room_ids uuid[])
returns table(room_id uuid, member_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if coalesce(array_length(p_room_ids,1),0)>1000 then raise exception 'عدد الغرف المطلوب كبير جداً'; end if;
  return query
    select r.id, count(m.user_id)::bigint
      from public.rooms r
      left join public.room_members m
        on m.room_id = r.id
       and m.last_seen_at >= now() - interval '180 seconds'
     where r.id = any(coalesce(p_room_ids,'{}'::uuid[]))
     group by r.id;
end;
$$;

revoke all on function public.cleanup_stale_room_presence(uuid) from public, anon;
grant execute on function public.cleanup_stale_room_presence(uuid) to authenticated;
