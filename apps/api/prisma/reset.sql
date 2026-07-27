-- Clean-setup: wipe ALL application data but keep the schema and migration history.
-- Dynamically truncates every table in `public` except Prisma's migration bookkeeping,
-- so it keeps working as new tables are added. Foreign keys are handled by CASCADE and
-- identity/serial counters are reset.
--
-- DESTRUCTIVE — dev/staging only. Run with:  psql "$DATABASE_URL" -f prisma/reset.sql
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', r.tablename);
  END LOOP;
END $$;
