-- Extend cosmetic slots and support expiring inventory items.
alter table public.profiles
  add column if not exists equipped_entrance_id text,
  add column if not exists equipped_bubble_id text,
  add column if not exists equipped_special_id text,
  add column if not exists equipped_profile_frame_id text,
  add column if not exists equipped_sound_frame_id text,
  add column if not exists equipped_voice_wave_id text;

alter table public.shop_items
  add column if not exists duration_days integer not null default 0;

alter table public.shop_items
  drop constraint if exists shop_items_duration_days_check;
alter table public.shop_items
  add constraint shop_items_duration_days_check
  check (duration_days between 0 and 3650);

alter table public.user_inventory
  add column if not exists expires_at timestamptz;

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
  select * into v_item from public.shop_items where id=p_item_id and active=true;
  if not found then raise exception 'هذا العنصر غير متاح'; end if;

  select expires_at into v_expires_at
    from public.user_inventory
   where user_id=v_user and item_id=p_item_id;

  if found and (v_expires_at is null or v_expires_at > now()) then
    return jsonb_build_object('owned',true,'item_id',p_item_id,'expires_at',v_expires_at);
  end if;

  update public.wallets
     set balance=balance-v_item.price,updated_at=now()
   where user_id=v_user and balance>=v_item.price
   returning balance into v_balance;
  if v_balance is null then raise exception 'رصيدك غير كافٍ لشراء هذا العنصر'; end if;

  v_expires_at := case when v_item.duration_days > 0
    then now() + make_interval(days => v_item.duration_days)
    else null end;

  insert into public.user_inventory(user_id,item_id,purchased_at,expires_at)
  values(v_user,p_item_id,now(),v_expires_at)
  on conflict (user_id,item_id) do update
    set purchased_at=now(),expires_at=excluded.expires_at;

  insert into public.wallet_transactions(user_id,amount,transaction_type,label)
  values(v_user,-v_item.price,'shop_purchase','شراء '||v_item.name);

  return jsonb_build_object('owned',true,'item_id',p_item_id,'balance',v_balance,'expires_at',v_expires_at);
end;
$$;

create or replace function public.equip_shop_item(p_item_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_type text;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  select s.item_type into v_type
    from public.shop_items s
    join public.user_inventory i on i.item_id=s.id
   where s.id=p_item_id
     and i.user_id=v_user
     and s.active=true
     and (i.expires_at is null or i.expires_at > now());

  if v_type is null then raise exception 'يجب امتلاك العنصر وأن تكون صلاحيته سارية'; end if;

  if v_type='frame' then
    update public.profiles set equipped_frame_id=p_item_id where id=v_user;
  elsif v_type='profile_frame' then
    update public.profiles set equipped_profile_frame_id=p_item_id where id=v_user;
  elsif v_type='entrance' then
    update public.profiles set equipped_entrance_id=p_item_id where id=v_user;
  elsif v_type='chat_bubble' then
    update public.profiles set equipped_bubble_id=p_item_id where id=v_user;
  elsif v_type='special_id' then
    update public.profiles set equipped_special_id=p_item_id where id=v_user;
  elsif v_type='sound_frame' then
    update public.profiles set equipped_sound_frame_id=p_item_id where id=v_user;
  elsif v_type='voice_wave' then
    update public.profiles set equipped_voice_wave_id=p_item_id where id=v_user;
  elsif v_type='emoji_pack' then
    update public.profiles set equipped_emoji_pack_id=p_item_id where id=v_user;
  else
    raise exception 'نوع العنصر لا يدعم التجهيز بعد';
  end if;
  return true;
end;
$$;

revoke all on function public.purchase_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated;
revoke all on function public.equip_shop_item(text) from public, anon;
grant execute on function public.equip_shop_item(text) to authenticated;

create or replace function public.unequip_shop_item(p_item_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_item_type='frame' then
    update public.profiles set equipped_frame_id=null where id=v_user;
  elsif p_item_type='profile_frame' then
    update public.profiles set equipped_profile_frame_id=null where id=v_user;
  elsif p_item_type='entrance' then
    update public.profiles set equipped_entrance_id=null where id=v_user;
  elsif p_item_type='chat_bubble' then
    update public.profiles set equipped_bubble_id=null where id=v_user;
  elsif p_item_type='special_id' then
    update public.profiles set equipped_special_id=null where id=v_user;
  elsif p_item_type='sound_frame' then
    update public.profiles set equipped_sound_frame_id=null where id=v_user;
  elsif p_item_type='voice_wave' then
    update public.profiles set equipped_voice_wave_id=null where id=v_user;
  elsif p_item_type='emoji_pack' then
    update public.profiles set equipped_emoji_pack_id=null where id=v_user;
  else
    raise exception 'نوع العنصر غير معروف';
  end if;
  return true;
end;
$$;

revoke all on function public.unequip_shop_item(text) from public, anon;
grant execute on function public.unequip_shop_item(text) to authenticated;

create or replace function public.refresh_cosmetic_expirations()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  update public.profiles p set
    equipped_frame_id = case when p.equipped_frame_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_frame_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_frame_id end,
    equipped_profile_frame_id = case when p.equipped_profile_frame_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_profile_frame_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_profile_frame_id end,
    equipped_entrance_id = case when p.equipped_entrance_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_entrance_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_entrance_id end,
    equipped_bubble_id = case when p.equipped_bubble_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_bubble_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_bubble_id end,
    equipped_special_id = case when p.equipped_special_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_special_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_special_id end,
    equipped_sound_frame_id = case when p.equipped_sound_frame_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_sound_frame_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_sound_frame_id end,
    equipped_voice_wave_id = case when p.equipped_voice_wave_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_voice_wave_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_voice_wave_id end,
    equipped_emoji_pack_id = case when p.equipped_emoji_pack_id is not null and not exists (
      select 1 from public.user_inventory i where i.user_id=v_user and i.item_id=p.equipped_emoji_pack_id and (i.expires_at is null or i.expires_at>now())
    ) then null else p.equipped_emoji_pack_id end
  where p.id=v_user;

  return true;
end;
$$;

revoke all on function public.refresh_cosmetic_expirations() from public, anon;
grant execute on function public.refresh_cosmetic_expirations() to authenticated;
