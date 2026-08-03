-- 0031_admin_account_username_normalized.sql
-- What: adds `username_normalized` (trim + lowercase) alongside `username` on
--       admin_accounts, backfills the existing row(s), and adds a UNIQUE index
--       on the normalized column.
-- Why:  SOU-153 — login must accept any casing. SQLite `COLLATE NOCASE` is
--       ASCII-only and wouldn't port to the future Postgres backend, so
--       normalization is a pure domain function (`normalizeUsername`)
--       instead: the repository writes both columns on every save and reads
--       by the normalized one. `username` (as typed) stays the display value.
-- Rollback: additive-only; logical undo is dropping the column/index (never
--       applied to a released DB in place).
-- First ships in: v2.x (SOU-153).
--
-- LOCAL infra table (see 0003_admin_account.sql header) — device-local, never
-- synced, so this backfill carries none of the sync-neutrality risk migration
-- backfills normally have (no `updated_at` / `version` to protect here). The
-- backfill below (`LOWER(TRIM(username))`) is a best-effort, ASCII-safe seed
-- for whatever row already exists; the very next admin-account save (e.g. a
-- password change) overwrites it with the precise `normalizeUsername` value,
-- since the repository recomputes this column from `username` on every write.

ALTER TABLE admin_accounts ADD COLUMN username_normalized TEXT;

UPDATE admin_accounts SET username_normalized = LOWER(TRIM(username));

CREATE UNIQUE INDEX ux_admin_accounts_username_normalized ON admin_accounts(username_normalized);
