drop policy if exists "Members can view owned cosmetic definitions" on public.shop_items;
create policy "Members can view owned cosmetic definitions"
on public.shop_items for select to authenticated
using (exists (select 1 from public.user_inventory ui where ui.item_id=shop_items.id));