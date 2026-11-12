-- Hamsat cosmetics, avatar frames, emoji packs and member inventory.
create table if not exists public.shop_items (
  id text primary key,
  name text not null,
  item_type text not null check (item_type in ('frame','emoji_pack')),
  price bigint not null check (price > 0),
  rarity text not null default 'عادي',
  visual_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.shop_items (id,name,item_type,price,rarity,visual_key) values
 ('frame_gold','الإطار الذهبي','frame',250,'مميز','gold'),
 ('frame_royal','الإطار الملكي','frame',750,'نادر','royal'),
 ('frame_diamond','إطار الألماس','frame',1800,'أسطوري','diamond'),
 ('emoji_love','حزمة القلوب','emoji_pack',120,'عادي','love'),
 ('emoji_luxe','حزمة الفخامة','emoji_pack',300,'مميز','luxe'),
 ('emoji_moon','حزمة القمر والنجوم','emoji_pack',450,'نادر','moon')
on conflict (id) do update set name=excluded.name,item_type=excluded.item_type,price=excluded.price,rarity=excluded.rarity,visual_key=excluded.visual_key,active=true;

create table if not exists public.user_inventory (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  unique(user_id,item_id)
);
alter table public.user_inventory enable row level security;
drop policy if exists "Members read own inventory" on public.user_inventory;
create policy "Members read own inventory" on public.user_inventory for select to authenticated using (auth.uid()=user_id);
grant select on public.user_inventory to authenticated;

alter table public.profiles add column if not exists equipped_frame_id text references public.shop_items(id) on delete set null;
alter table public.profiles add column if not exists equipped_emoji_pack_id text references public.shop_items(id) on delete set null;

alter table public.shop_items enable row level security;
drop policy if exists "Authenticated members read active shop items" on public.shop_items;
create policy "Authenticated members read active shop items" on public.shop_items for select to authenticated using (active=true);
grant select on public.shop_items to authenticated;

alter table public.wallet_transactions drop constraint if exists wallet_transactions_transaction_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_transaction_type_check
 check (transaction_type in ('welcome','daily_reward','gift_sent','gift_received','admin_adjustment','shop_purchase'));

create or replace function public.purchase_shop_item(p_item_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_item public.shop_items%rowtype; v_balance bigint;
begin
 if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
 select * into v_item from public.shop_items where id=p_item_id and active=true;
 if not found then raise exception 'هذا العنصر غير متاح'; end if;
 if exists(select 1 from public.user_inventory where user_id=v_user and item_id=p_item_id) then
   return jsonb_build_object('owned',true,'item_id',p_item_id);
 end if;
 update public.wallets set balance=balance-v_item.price,updated_at=now()
 where user_id=v_user and balance>=v_item.price returning balance into v_balance;
 if v_balance is null then raise exception 'رصيدك غير كافٍ لشراء هذا العنصر'; end if;
 insert into public.user_inventory(user_id,item_id) values(v_user,p_item_id);
 insert into public.wallet_transactions(user_id,amount,transaction_type,label)
 values(v_user,-v_item.price,'shop_purchase','شراء '||v_item.name);
 return jsonb_build_object('owned',true,'item_id',p_item_id,'balance',v_balance);
end; $$;

create or replace function public.equip_shop_item(p_item_id text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_type text;
begin
 if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
 select item_type into v_type from public.shop_items s
 join public.user_inventory i on i.item_id=s.id
 where s.id=p_item_id and i.user_id=v_user and s.active=true;
 if v_type is null then raise exception 'يجب امتلاك العنصر أولًا'; end if;
 if v_type='frame' then
   update public.profiles set equipped_frame_id=p_item_id where id=v_user;
 elsif v_type='emoji_pack' then
   update public.profiles set equipped_emoji_pack_id=p_item_id where id=v_user;
 end if;
 return true;
end; $$;

revoke all on function public.purchase_shop_item(text) from public;
grant execute on function public.purchase_shop_item(text) to authenticated;
revoke all on function public.equip_shop_item(text) from public;
grant execute on function public.equip_shop_item(text) to authenticated;
