-- Hamsat: grant the authenticated app role the table privileges
-- required to use profiles. Row-level security policies in 0001_identity.sql
-- continue to restrict inserts/updates to the signed-in user's own row.
grant select, insert, update on table public.profiles to authenticated;
