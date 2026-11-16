-- HAMSAT admin console catalog and safe reporting access.
alter table public.shop_items drop constraint if exists shop_items_item_type_check;
alter table public.shop_items add constraint shop_items_item_type_check check (item_type in ('frame','emoji_pack','entrance','sound_frame','voice_wave'));
alter table public.shop_items add column if not exists animation_url text;
alter table public.gifts add column if not exists description text not null default '', add column if not exists image_url text, add column if not exists animation_url text;
grant select,insert,update,delete on public.gifts to authenticated;
drop policy if exists "Admins manage gifts" on public.gifts;
create policy "Admins manage gifts" on public.gifts for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins read all member inventory" on public.user_inventory;
create policy "Admins read all member inventory" on public.user_inventory for select to authenticated using (public.is_admin());
drop policy if exists "Admins read all wallets" on public.wallets;
create policy "Admins read all wallets" on public.wallets for select to authenticated using (public.is_admin());
drop policy if exists "Admins read all wallet transactions" on public.wallet_transactions;
create policy "Admins read all wallet transactions" on public.wallet_transactions for select to authenticated using (public.is_admin());
drop policy if exists "Admins read all gift transactions" on public.gift_transactions;
create policy "Admins read all gift transactions" on public.gift_transactions for select to authenticated using (public.is_admin());
grant select on public.user_inventory,public.wallets,public.wallet_transactions,public.gift_transactions to authenticated;
