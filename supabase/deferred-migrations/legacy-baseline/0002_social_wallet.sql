-- Hamsat social + wallet foundation (Supabase).
-- Safe to apply after 0001_identity.sql. Balances are server-owned and changed only by RPCs.

alter table public.profiles
  add column if not exists color text not null default '#7c3aed';

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 50),
  topic text not null default 'عام' check (char_length(topic) <= 20),
  description text not null default '' check (char_length(description) <= 160),
  created_at timestamptz not null default now()
);
create index if not exists rooms_created_at_idx on public.rooms (created_at desc);
create index if not exists rooms_owner_id_idx on public.rooms (owner_id);
alter table public.rooms enable row level security;
drop policy if exists "Authenticated users can read rooms" on public.rooms;
create policy "Authenticated users can read rooms"
  on public.rooms for select to authenticated using (true);
drop policy if exists "Users create their own rooms" on public.rooms;
create policy "Users create their own rooms"
  on public.rooms for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "Owners delete their own rooms" on public.rooms;
create policy "Owners delete their own rooms"
  on public.rooms for delete to authenticated using (auth.uid() = owner_id);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  daily_claimed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
drop policy if exists "Users can read their own wallet" on public.wallets;
create policy "Users can read their own wallet"
  on public.wallets for select to authenticated using (auth.uid() = user_id);
-- Deliberately no client insert/update/delete policies for wallets.

create table if not exists public.wallet_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  transaction_type text not null check (transaction_type in ('welcome', 'daily_reward', 'gift_sent', 'gift_received', 'admin_adjustment')),
  label text not null,
  created_at timestamptz not null default now()
);
create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);
alter table public.wallet_transactions enable row level security;
drop policy if exists "Users can read their own wallet transactions" on public.wallet_transactions;
create policy "Users can read their own wallet transactions"
  on public.wallet_transactions for select to authenticated using (auth.uid() = user_id);
-- Deliberately no client write policies for the ledger.

create table if not exists public.gifts (
  id text primary key,
  name text not null,
  price bigint not null check (price > 0),
  icon text not null,
  active boolean not null default true
);
insert into public.gifts (id, name, price, icon) values
  ('rose', 'وردة', 10, 'flower-2'),
  ('heart', 'قلب', 25, 'heart'),
  ('coffee', 'قهوة عربية', 40, 'coffee'),
  ('star', 'نجمة', 75, 'star'),
  ('moon', 'هلال', 120, 'moon'),
  ('gem', 'جوهرة', 250, 'gem'),
  ('crown', 'تاج', 500, 'crown'),
  ('rocket', 'صاروخ', 1000, 'rocket')
on conflict (id) do update set name = excluded.name, price = excluded.price, icon = excluded.icon;

alter table public.gifts enable row level security;
drop policy if exists "Anyone can read active gifts" on public.gifts;
create policy "Anyone can read active gifts"
  on public.gifts for select to anon, authenticated using (active = true);

create table if not exists public.gift_transactions (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  gift_id text not null references public.gifts(id),
  quantity integer not null check (quantity between 1 and 100),
  total_price bigint not null check (total_price > 0),
  created_at timestamptz not null default now(),
  constraint gift_not_self check (sender_id <> recipient_id)
);
create index if not exists gift_transactions_sender_idx on public.gift_transactions (sender_id, created_at desc);
create index if not exists gift_transactions_recipient_idx on public.gift_transactions (recipient_id, created_at desc);
alter table public.gift_transactions enable row level security;
drop policy if exists "Users can read gift transactions involving them" on public.gift_transactions;
create policy "Users can read gift transactions involving them"
  on public.gift_transactions for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Ensure profiles and wallets are created for every future Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  insert into public.wallets (user_id, balance)
  values (new.id, 100)
  on conflict (user_id) do nothing;
  insert into public.wallet_transactions (user_id, amount, transaction_type, label)
  values (new.id, 100, 'welcome', 'مكافأة الترحيب')
  on conflict do nothing;
  return new;
end;
$$;

-- Existing invited/test accounts receive a zero-balance wallet; do not mint
-- retroactive welcome bonuses during migration.
insert into public.wallets (user_id, balance)
select id, 0 from auth.users
on conflict (user_id) do nothing;

create or replace function public.claim_daily_reward()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_balance bigint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  update public.wallets
     set balance = balance + 20,
         daily_claimed_at = now(),
         updated_at = now()
   where user_id = v_user
     and (daily_claimed_at is null or daily_claimed_at <= now() - interval '24 hours')
   returning balance into v_balance;
  if v_balance is null then raise exception 'لقد استلمت مكافأة اليوم بالفعل'; end if;
  insert into public.wallet_transactions (user_id, amount, transaction_type, label)
  values (v_user, 20, 'daily_reward', 'المكافأة اليومية');
  return v_balance;
end;
$$;

create or replace function public.send_gift(
  p_recipient uuid,
  p_gift_id text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := auth.uid();
  v_price bigint;
  v_total bigint;
  v_sender_balance bigint;
  v_recipient_balance bigint;
  v_gift_name text;
begin
  if v_sender is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_recipient is null or p_recipient = v_sender then raise exception 'لا يمكن إرسال هدية إلى نفسك'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'الكمية غير صالحة'; end if;

  select price, name into v_price, v_gift_name
    from public.gifts where id = p_gift_id and active = true;
  if v_price is null then raise exception 'الهدية غير متاحة'; end if;
  v_total := v_price * p_quantity;

  update public.wallets
     set balance = balance - v_total, updated_at = now()
   where user_id = v_sender and balance >= v_total
   returning balance into v_sender_balance;
  if v_sender_balance is null then raise exception 'رصيدك غير كافٍ'; end if;

  insert into public.wallets (user_id, balance)
  values (p_recipient, 0) on conflict (user_id) do nothing;
  update public.wallets
     set balance = balance + v_total, updated_at = now()
   where user_id = p_recipient
   returning balance into v_recipient_balance;
  if v_recipient_balance is null then raise exception 'المستلم غير موجود'; end if;

  insert into public.wallet_transactions (user_id, amount, transaction_type, label)
  values
    (v_sender, -v_total, 'gift_sent', 'إرسال ' || v_gift_name),
    (p_recipient, v_total, 'gift_received', 'استلام ' || v_gift_name);
  insert into public.gift_transactions (sender_id, recipient_id, gift_id, quantity, total_price)
  values (v_sender, p_recipient, p_gift_id, p_quantity, v_total);

  return jsonb_build_object(
    'sender_balance', v_sender_balance,
    'recipient_balance', v_recipient_balance,
    'total_price', v_total,
    'gift_name', v_gift_name,
    'quantity', p_quantity
  );
end;
$$;

revoke all on function public.claim_daily_reward() from public;
grant execute on function public.claim_daily_reward() to authenticated;
revoke all on function public.send_gift(uuid, text, integer) from public;
grant execute on function public.send_gift(uuid, text, integer) to authenticated;
