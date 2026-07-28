-- 0001_init.sql
-- What: baseline local metadata table for a freshly created center database.
-- Why:  gives the migration runner a first real migration and a home for
--       local, NON-synced app state (schema baseline, first-run flags).
-- First ships in: v2.0.0.
--
-- Note: app_meta is a LOCAL infra table (like _schema_migrations) — it carries
-- no sync envelope and never leaves the device. Entity tables (students,
-- teachers, …) arrive in their own migrations with the full envelope template.

CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
