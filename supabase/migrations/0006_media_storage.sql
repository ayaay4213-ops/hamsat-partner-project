-- Hamsat media storage and room cover support
alter table public.rooms add column if not exists cover_url text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('hamsat-media','hamsat-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Hamsat media is publicly readable" on storage.objects;
create policy "Hamsat media is publicly readable" on storage.objects for select using (bucket_id='hamsat-media');
drop policy if exists "Members upload their own Hamsat media" on storage.objects;
create policy "Members upload their own Hamsat media" on storage.objects for insert to authenticated with check (bucket_id='hamsat-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Members update their own Hamsat media" on storage.objects;
create policy "Members update their own Hamsat media" on storage.objects for update to authenticated using (bucket_id='hamsat-media' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='hamsat-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Members delete their own Hamsat media" on storage.objects;
create policy "Members delete their own Hamsat media" on storage.objects for delete to authenticated using (bucket_id='hamsat-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- Expand the starter gift shelf to twelve distinct gifts.
insert into public.gifts (id,name,price,icon) values
  ('car','سيارة فاخرة',1500,'car-front'),
  ('castle','قصر ملكي',2500,'castle'),
  ('fireworks','ألعاب نارية',3500,'sparkles'),
  ('diamond_ring','خاتم ألماس',5000,'gem')
on conflict (id) do update set name=excluded.name,price=excluded.price,icon=excluded.icon,active=true;
