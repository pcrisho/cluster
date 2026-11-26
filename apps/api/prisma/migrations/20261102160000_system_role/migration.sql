-- The system client's role (SystemPrismaService): bypasses RLS, DML only, owns nothing. It replaces the owner
-- in the API process. `db-roles` creates it with LOGIN and its password; BYPASSRLS needs a superuser to grant,
-- so on a managed database run `db:roles` as the provider's admin first. This only creates it if missing.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cluster_system') THEN
    CREATE ROLE cluster_system NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO cluster_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cluster_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cluster_system;
-- Prisma's shadow database (`migrate dev`) has no _prisma_migrations table; every real database does.
DO $$ BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM cluster_system;
  END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cluster_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cluster_system;
