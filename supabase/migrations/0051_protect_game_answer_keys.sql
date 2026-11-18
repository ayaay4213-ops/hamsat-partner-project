-- Protect correct answers in games.config from direct client reads.
-- Public clients may read game metadata only; game writes remain admin-only through RLS.
revoke all on public.games from anon,authenticated;
grant select (id,name,description,game_type,icon,active,sort_order,created_at,updated_at)
  on public.games to anon,authenticated;
grant insert,update,delete on public.games to authenticated;
