-- Applied in production as version 20261124122508.
-- Future tables created by postgres must not grant maintenance/DDL-adjacent privileges to API roles.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
