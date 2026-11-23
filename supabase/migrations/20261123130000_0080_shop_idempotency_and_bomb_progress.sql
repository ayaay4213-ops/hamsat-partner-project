-- HAMSAT 0080: serialize shop purchases and preserve room-bomb progress.
-- Prepared only; do not apply to production without a separate verified test.

create or replace function public.purchase_shop_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_item public.shop_items%rowtype;
  v_balance bigint;
  v_expires_at timestamptz;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  -- Serialize attempts for the same user/item so simultaneous requests
  -- cannot both debit before either one records ownership.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_item_id, 0));

  select * into v_item
    from public.shop_items
   where id = p_item_id and active = true
   for share;
  if not found then raise exception 'هذا العنصر غير متاح'; end if;

  select expires_at into v_expires_at
    from public.user_inventory
   where user_id = v_user and item_id = p_item_id
   for update;

  if found and (v_expires_at is null or v_expires_at > now()) then
    select balance into v_balance from public.wallets where user_id = v_user;
    return jsonb_build_object('owned', true, 'item_id', p_item_id, 'balance', v_balance, 'expires_at', v_expires_at);
  end if;

  if v_item.price > 0 then
    update public.wallets
       set balance = balance - v_item.price, updated_at = now()
     where user_id = v_user and balance >= v_item.price
     returning balance into v_balance;
    if v_balance is null then raise exception 'رصيدك غير كافٍ لشراء هذا العنصر'; end if;
  else
    select balance into v_balance from public.wallets where user_id = v_user;
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
$function$;

create or replace function private.apply_room_bomb_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_amount bigint := greatest(0, coalesce((new.payload->>'total_price')::bigint, 0));
  v_bomb public.room_bombs%rowtype;
  v_config public.room_bomb_levels%rowtype;
  v_member record;
  v_rank bigint;
  v_base bigint;
  v_reward bigint;
  v_multiplier numeric;
  v_rewards jsonb;
  v_remaining bigint;
  v_completed_level integer;
begin
  if new.event_type <> 'gift' or v_amount <= 0 then
    return new;
  end if;

  insert into public.room_bombs(room_id)
  values (new.room_id)
  on conflict (room_id) do nothing;

  select * into v_bomb
    from public.room_bombs
   where room_id = new.room_id
   for update;

  if v_bomb.ends_at <= now() then
    update public.room_bombs
       set level = 1, progress = 0, started_at = now(),
           ends_at = now() + interval '24 hours', updated_at = now()
     where room_id = new.room_id;
    delete from public.room_bomb_contributions where room_id = new.room_id;
    select * into v_bomb from public.room_bombs where room_id = new.room_id;
  end if;

  insert into public.room_bomb_contributions(room_id, user_id, points)
  values (new.room_id, new.actor_id, v_amount)
  on conflict (room_id, user_id) do update
    set points = public.room_bomb_contributions.points + excluded.points,
        updated_at = now();

  update public.room_bombs
     set progress = progress + v_amount, updated_at = now()
   where room_id = new.room_id
   returning * into v_bomb;

  -- Process every level reached by this contribution. Progress is reduced by
  -- each level threshold rather than reset to zero, preserving the remainder.
  loop
    select * into v_config
      from public.room_bomb_levels
     where level = v_bomb.level and active = true;

    if not found or v_bomb.progress < v_config.threshold then
      exit;
    end if;

    v_completed_level := v_bomb.level;
    v_rewards := '[]'::jsonb;

    for v_member in
      select m.user_id
        from public.room_members m
       where m.room_id = new.room_id
    loop
      v_base := v_config.reward_min
        + floor(random() * (v_config.reward_max - v_config.reward_min + 1))::bigint;

      select ranked.position into v_rank
        from (
          select user_id, row_number() over (order by points desc, user_id) as position
            from public.room_bomb_contributions
           where room_id = new.room_id
        ) ranked
       where ranked.user_id = v_member.user_id;

      v_multiplier := case v_rank
        when 1 then 2.0
        when 2 then 1.5
        when 3 then 1.25
        else 1.0
      end;
      v_reward := floor(v_base * v_multiplier)::bigint;

      insert into public.wallets(user_id, balance)
      values (v_member.user_id, 0)
      on conflict (user_id) do nothing;

      update public.wallets
         set balance = balance + v_reward, updated_at = now()
       where user_id = v_member.user_id;

      insert into public.wallet_transactions(user_id, amount, transaction_type, label)
      values (v_member.user_id, v_reward, 'room_bomb_reward', 'جائزة قنبلة الغرفة');

      insert into public.room_bomb_rewards(room_id, user_id, level, amount)
      values (new.room_id, v_member.user_id, v_completed_level, v_reward);

      v_rewards := v_rewards || jsonb_build_array(
        jsonb_build_object('amount', v_reward, 'rank', v_rank)
      );
    end loop;

    insert into public.room_activity_events(room_id, actor_id, event_type, payload)
    values (
      new.room_id,
      new.actor_id,
      'bomb',
      jsonb_build_object(
        'level_completed', v_completed_level,
        'next_level', case when v_completed_level = 5 then 1 else v_completed_level + 1 end,
        'threshold', v_config.threshold,
        'rewards', v_rewards
      )
    );

    if v_completed_level = 5 then
      -- A new five-level cycle begins. Keep any remainder from this gift
      -- as the first contribution in the new cycle.
      v_remaining := greatest(0, v_bomb.progress - v_config.threshold);
      update public.room_bombs
         set level = 1, progress = v_remaining, started_at = now(),
             ends_at = now() + interval '24 hours', updated_at = now()
       where room_id = new.room_id
       returning * into v_bomb;

      delete from public.room_bomb_contributions where room_id = new.room_id;
      if v_remaining > 0 then
        insert into public.room_bomb_contributions(room_id, user_id, points)
        values (new.room_id, new.actor_id, v_remaining)
        on conflict (room_id, user_id) do update
          set points = excluded.points, updated_at = now();
      end if;
    else
      update public.room_bombs
         set level = level + 1, progress = progress - v_config.threshold, updated_at = now()
       where room_id = new.room_id
       returning * into v_bomb;
    end if;
  end loop;

  return new;
end;
$function$;
