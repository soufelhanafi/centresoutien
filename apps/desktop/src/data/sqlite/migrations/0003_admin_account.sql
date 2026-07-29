-- 0003_admin_account.sql
-- What: local admin account (single row) with an Argon2id password hash.
-- Why:  first-run creates it; login verifies against it (SOU-26 / SOU-27).
-- First ships in: v2.0.0.
--
-- LOCAL infra table — like app_meta and _schema_migrations, it carries NO sync
-- envelope (no center_code / device_origin / version / deleted_at) and never
-- leaves the device: credentials are device-local, not synced. The password_hash
-- is produced by the Argon2id adapter in the main process; plaintext is never
-- stored. Lockout/session columns arrive additively in SOU-27.

CREATE TABLE admin_accounts (
  id            TEXT PRIMARY KEY,   -- ULID with 'adm_' prefix
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,      -- Argon2id PHC string; hashing happens in main only
  created_at    TEXT NOT NULL,      -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  CHECK (id LIKE 'adm\_%' ESCAPE '\')
);

CREATE UNIQUE INDEX ux_admin_accounts_username ON admin_accounts(username);
