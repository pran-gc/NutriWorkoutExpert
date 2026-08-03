-- ============================================================================
-- 0002 · Table privileges for the Supabase API roles
-- ============================================================================
-- Migration 0001 created every table as the `postgres` owner and enabled RLS,
-- but never granted DML to the Supabase roles (`anon`, `authenticated`,
-- `service_role`). On a hosted project these grants come from Supabase's own
-- bootstrap; on the local CLI stack they were missing, so every app query hit
-- "permission denied for table ...". RLS is still the real access control — these
-- grants only let the roles reach the tables so RLS policies can then apply.
--
-- Forward-only fix (0001 is applied — never edit it).
-- ============================================================================

-- Existing tables/sequences in the public schema.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Future tables/sequences/functions created by `postgres` in public get the same
-- grants automatically, so later migrations don't have to remember this.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
