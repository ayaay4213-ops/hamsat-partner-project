alter table public.rooms add column if not exists seat_layout text not null default 'grid';
alter table public.rooms drop constraint if exists rooms_seat_layout_check;
alter table public.rooms add constraint rooms_seat_layout_check check (seat_layout in ('grid','one-top','two-top'));
alter table public.moments add column if not exists location text null;
alter table public.moments drop constraint if exists moments_location_length_check;
alter table public.moments add constraint moments_location_length_check check (location is null or char_length(location) <= 120);
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;
