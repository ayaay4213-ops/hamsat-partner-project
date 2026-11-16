-- Categorize the gift catalog for the in-room gift panel.
alter table public.gifts
  add column if not exists category text not null default 'app';

alter table public.gifts
  drop constraint if exists gifts_category_check;
alter table public.gifts
  add constraint gifts_category_check
  check (category in ('app','event','lucky','special'));

create index if not exists gifts_active_category_sort_idx
  on public.gifts(category, active, price);
