-- HAMSAT room backgrounds: catalog ownership and room-level selection.
-- This migration is committed to the development branch only; it is not applied here.

alter table public.shop_items
  drop constraint if exists shop_items_item_type_check;

alter table public.shop_items
  add constraint shop_items_item_type_check
  check (item_type in (
    'frame',
    'emoji_pack',
    'entrance',
    'sound_frame',
    'voice_wave',
    'profile_frame',
    'chat_bubble',
    'special_id',
    'room_background'
  ));

alter table public.rooms
  add column if not exists background_item_id text
  references public.shop_items(id) on delete set null;

-- Owners may select only a currently active room-background item that they own.
-- Custom uploaded cover_url backgrounds remain supported independently.
create or replace function private.validate_room_background_selection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.background_item_id is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.shop_items s
      join public.user_inventory i
        on i.item_id = s.id
       and i.user_id = new.owner_id
     where s.id = new.background_item_id
       and s.item_type = 'room_background'
       and s.active = true
       and (i.expires_at is null or i.expires_at > now())
  ) then
    raise exception 'يجب امتلاك خلفية غرفة صالحة قبل تطبيقها';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_room_background_selection() from public, anon, authenticated;

drop trigger if exists validate_room_background_selection on public.rooms;
create trigger validate_room_background_selection
  before insert or update of background_item_id, owner_id
  on public.rooms
  for each row
  execute function private.validate_room_background_selection();

-- Preserve the existing owner-only room update policy and grant only this new column.
grant update (background_item_id) on public.rooms to authenticated;

-- Six public/free backgrounds are supported alongside premium paid backgrounds.
alter table public.shop_items
  drop constraint if exists shop_items_price_check;
alter table public.shop_items
  add constraint shop_items_price_check check (price >= 0);

-- Keep the established inventory-expiry flow while allowing zero-cost claims.
create or replace function public.purchase_shop_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_item public.shop_items%rowtype;
  v_balance bigint;
  v_expires_at timestamptz;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  select * into v_item
    from public.shop_items
   where id = p_item_id and active = true
   for share;
  if not found then raise exception 'هذا العنصر غير متاح'; end if;

  select expires_at into v_expires_at
    from public.user_inventory
   where user_id = v_user and item_id = p_item_id;

  if found and (v_expires_at is null or v_expires_at > now()) then
    return jsonb_build_object('owned', true, 'item_id', p_item_id, 'expires_at', v_expires_at);
  end if;

  if v_item.price > 0 then
    update public.wallets
       set balance = balance - v_item.price, updated_at = now()
     where user_id = v_user and balance >= v_item.price
     returning balance into v_balance;
    if v_balance is null then raise exception 'رصيدك غير كافٍ لشراء هذا العنصر'; end if;
  else
    select balance into v_balance
      from public.wallets
     where user_id = v_user;
  end if;

  v_expires_at := case when v_item.duration_days > 0
    then now() + make_interval(days => v_item.duration_days)
    else null end;

  insert into public.user_inventory(user_id, item_id, purchased_at, expires_at)
  values (v_user, p_item_id, now(), v_expires_at)
  on conflict (user_id, item_id) do update
    set purchased_at = now(), expires_at = excluded.expires_at;

  if v_item.price > 0 then
    insert into public.wallet_transactions(user_id, amount, transaction_type, label)
    values (v_user, -v_item.price, 'shop_purchase', 'شراء ' || v_item.name);
  end if;

  return jsonb_build_object('owned', true, 'item_id', p_item_id, 'balance', v_balance, 'expires_at', v_expires_at);
end;
$$;

revoke all on function public.purchase_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated;
