-- Restrict room admission and shared-background changes to their intended RPC/owner paths.
-- This migration is reviewed but must be applied only after explicit approval.

create or replace function private.is_room_owner(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.rooms r
     where r.id = p_room_id
       and r.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_owner(uuid) from public, anon;
grant execute on function private.is_room_owner(uuid) to authenticated;

-- Room membership must be created by the atomic, verified join RPC.
drop policy if exists "Users join rooms as themselves" on public.room_members;

-- Room creation must pass through create_owned_room, which enforces the one-room limit.
drop policy if exists "Users create their own rooms" on public.rooms;

-- Only the room owner may choose or remove the shared room background.
drop policy if exists "Room members set shared background" on public.room_backgrounds;
drop policy if exists "Room members update shared background" on public.room_backgrounds;
drop policy if exists "Room members remove shared background" on public.room_backgrounds;

create policy "Room owners set shared background"
  on public.room_backgrounds
  for insert
  to authenticated
  with check (
    auth.uid() = updated_by
    and private.is_room_owner(room_id)
  );

create policy "Room owners update shared background"
  on public.room_backgrounds
  for update
  to authenticated
  using (private.is_room_owner(room_id))
  with check (
    auth.uid() = updated_by
    and private.is_room_owner(room_id)
  );

create policy "Room owners remove shared background"
  on public.room_backgrounds
  for delete
  to authenticated
  using (private.is_room_owner(room_id));


-- Validate background ownership on the database side, not only in the room picker UI.
-- This RPC runs as the caller, so room owner RLS remains in force.
create or replace function public.save_room_background(
  p_room_id uuid,
  p_image_url text default null,
  p_background_item_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_image_url text := p_image_url;
  v_room_id uuid;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  if p_room_id is null then
    raise exception 'الغرفة غير محددة';
  end if;

  if p_background_item_id is not null then
    select si.image_url
      into v_image_url
      from public.shop_items si
     where si.id = p_background_item_id
       and si.item_type = 'room_background'
       and si.active = true
       and (
         si.price = 0
         or exists (
           select 1
             from public.user_inventory ui
            where ui.user_id = v_user
              and ui.item_id = si.id
              and (ui.expires_at is null or ui.expires_at > now())
         )
       );

    if not found then
      raise exception 'هذه الخلفية المدفوعة غير موجودة أو غير مملوكة لحسابك';
    end if;
  elsif v_image_url is not null and (
    length(v_image_url) > 2048
    or v_image_url !~ '^https://'
  ) then
    raise exception 'رابط خلفية الغرفة غير صالح';
  end if;

  update public.rooms
     set background_item_id = p_background_item_id
   where id = p_room_id
     and owner_id = v_user
   returning id into v_room_id;

  if v_room_id is null then
    raise exception 'تغيير خلفية الغرفة متاح للمضيف فقط';
  end if;

  insert into public.room_backgrounds(room_id, image_url, updated_by, updated_at)
  values (p_room_id, v_image_url, v_user, now())
  on conflict (room_id)
  do update set
    image_url = excluded.image_url,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'room_id', p_room_id,
    'image_url', v_image_url,
    'background_item_id', p_background_item_id
  );
end;
$$;

revoke all on function public.save_room_background(uuid, text, text) from public, anon;
grant execute on function public.save_room_background(uuid, text, text) to authenticated;
