-- Protect profile identity and cosmetic entitlements from direct PostgREST updates.
-- Cosmetic equip/unequip remains available only through the validated RPCs below.

create or replace function private.guard_profile_sensitive_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if (new.public_id is distinct from old.public_id
      or new.created_at is distinct from old.created_at)
     and not public.is_admin() then
    raise exception 'لا يمكن تغيير معرّف الحساب أو تاريخ إنشائه.';
  end if;

  if (
    new.equipped_frame_id is distinct from old.equipped_frame_id
    or new.equipped_emoji_pack_id is distinct from old.equipped_emoji_pack_id
    or new.equipped_entrance_id is distinct from old.equipped_entrance_id
    or new.equipped_bubble_id is distinct from old.equipped_bubble_id
    or new.equipped_special_id is distinct from old.equipped_special_id
    or new.equipped_profile_frame_id is distinct from old.equipped_profile_frame_id
    or new.equipped_sound_frame_id is distinct from old.equipped_sound_frame_id
    or new.equipped_voice_wave_id is distinct from old.equipped_voice_wave_id
  ) and current_setting('app.hamsat_cosmetic_equip', true) is distinct from 'on' then
    raise exception 'استخدمي متجر همسات لتجهيز العناصر التي تملكينها فقط.';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_profile_sensitive_fields() from public, anon, authenticated;

drop trigger if exists profiles_guard_sensitive_fields on public.profiles;
create trigger profiles_guard_sensitive_fields
before update on public.profiles
for each row execute function private.guard_profile_sensitive_fields();

create or replace function public.equip_shop_item(p_item_id text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform set_config('app.hamsat_cosmetic_equip','on',true);

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
$function$;

create or replace function public.unequip_shop_item(p_item_type text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  perform set_config('app.hamsat_cosmetic_equip','on',true);

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
$function$;
