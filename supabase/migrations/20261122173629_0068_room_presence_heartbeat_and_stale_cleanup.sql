alter table public.room_members
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists room_members_room_last_seen_idx
  on public.room_members (room_id, last_seen_at);

create or replace function public.heartbeat_room_presence(p_room_id uuid)
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

  update public.room_members
     set last_seen_at = now()
   where room_id = p_room_id
     and user_id = v_user;

  if not found then
    raise exception 'عضويتك في الغرفة غير موجودة';
  end if;

  return true;
end;
$$;

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
       and last_seen_at < now() - interval '90 seconds'
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

  return v_deleted;
end;
$$;

revoke all on function public.heartbeat_room_presence(uuid) from public, anon;
revoke all on function public.cleanup_stale_room_presence(uuid) from public, anon;
grant execute on function public.heartbeat_room_presence(uuid) to authenticated;
grant execute on function public.cleanup_stale_room_presence(uuid) to authenticated;
