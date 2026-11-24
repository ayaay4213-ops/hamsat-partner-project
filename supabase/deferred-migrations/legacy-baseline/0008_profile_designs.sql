-- Hamsat member profile covers and custom backgrounds
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists background_url text;
