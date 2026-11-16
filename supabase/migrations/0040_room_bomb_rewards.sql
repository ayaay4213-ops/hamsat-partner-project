-- HAMSAT Room Bomb: server-side progress, level rewards and contributor bonuses.
-- Every committed room-gift event contributes its actual wallet spend.

create table if not exists public.room_bomb_levels (
  level smallint primary key check (level between 1 and 5),
  threshold bigint not null check (threshold > 0),
  reward_min bigint not null check (reward_min >= 0),
  reward_max bigint not null check (reward_max >= reward_min),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.room_bomb_levels(level, threshold, reward_min, reward_max)
values
  (1, 5000, 100, 300),
  (2, 10000, 200, 500),
  (3, 20000, 300, 800),
  (4, 35000, 500, 1200),
  (5, 50000, 1000, 3000)
on conflict (level) do nothing;

create table if not exists public.room_bombs (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  level smallint not null default 1 check (level between 1 and 5),
  progress bigint not null default 0 check (progress >= 0),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_bomb_contributions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  points bigint not null default 0 check (points >= 0),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.room_bomb_rewards (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  level smallint not null check (level between 1 and 5),
  reward_type text not null default 'coins' check (reward_type in ('coins','item')),
  amount bigint not null default 0 check (amount >= 0),
  item_id text,
  created_at timestamptz not null default now()
);

create index if not exists room_bomb_contributions_top_idx
  on public.room_bomb_contributions(room_id, points desc);
create index if not exists room_bomb_rewards_room_created_idx
  on public.room_bomb_rewards(room_id, created_at desc);

alter table public.room_bomb_levels enable row level security;
alter table public.room_bombs enable row level security;
alter table public.room_bomb_contributions enable row level security;
alter table public.room_bomb_rewards enable row level security;

drop policy if exists "Members read room bomb levels" on public.room_bomb_levels;
create policy "Members read room bomb levels"
  on public.room_bomb_levels for select to authenticated using (true);
drop policy if exists "Admins manage room bomb levels" on public.room_bomb_levels;
create policy "Admins manage room bomb levels"
  on public.room_bomb_levels for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Room members read room bombs" on public.room_bombs;
create policy "Room members read room bombs"
  on public.room_bombs for select to authenticated
  using (private.is_room_member(room_bombs.room_id));
drop policy if exists "Room members read bomb contributions" on public.room_bomb_contributions;
create policy "Room members read bomb contributions"
  on public.room_bomb_contributions for select to authenticated
  using (private.is_room_member(room_bomb_contributions.room_id));
drop policy if exists "Room members read bomb rewards" on public.room_bomb_rewards;
create policy "Room members read bomb rewards"
  on public.room_bomb_rewards for select to authenticated
  using (private.is_room_member(room_bomb_rewards.room_id));

grant select on public.room_bomb_levels, public.room_bombs,
  public.room_bomb_contributions, public.room_bomb_rewards to authenticated;
grant insert, update, delete on public.room_bomb_levels to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.room_bombs, public.room_bomb_contributions, public.room_bomb_rewards
  from anon, authenticated;

create or replace function private.apply_room_bomb_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount bigint := greatest(0, coalesce((new.payload->>'total_price')::bigint, 0));
  v_bomb public.room_bombs%rowtype;
  v_config public.room_bomb_levels%rowtype;
  v_member record;
  v_rank bigint;
  v_base bigint;
  v_reward bigint;
  v_multiplier numeric;
  v_rewards jsonb := '[]'::jsonb;
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

  select * into v_config
    from public.room_bomb_levels
   where level = v_bomb.level and active = true;

  if not found or v_bomb.progress < v_config.threshold then
    return new;
  end if;

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
    values (new.room_id, v_member.user_id, v_bomb.level, v_reward);

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
      'level_completed', v_bomb.level,
      'next_level', case when v_bomb.level = 5 then 1 else v_bomb.level + 1 end,
      'threshold', v_config.threshold,
      'rewards', v_rewards
    )
  );

  if v_bomb.level = 5 then
    update public.room_bombs
       set level = 1, progress = 0, started_at = now(),
           ends_at = now() + interval '24 hours', updated_at = now()
     where room_id = new.room_id;
    delete from public.room_bomb_contributions where room_id = new.room_id;
  else
    update public.room_bombs
       set level = level + 1, progress = 0, updated_at = now()
     where room_id = new.room_id;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_room_bomb_contribution() from public, anon, authenticated;
drop trigger if exists room_gift_updates_bomb on public.room_activity_events;
create trigger room_gift_updates_bomb
after insert on public.room_activity_events
for each row
when (new.event_type = 'gift')
execute function private.apply_room_bomb_contribution();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_bombs') then
    alter publication supabase_realtime add table public.room_bombs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_bomb_contributions') then
    alter publication supabase_realtime add table public.room_bomb_contributions;
  end if;
end
$$;
