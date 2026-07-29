-- 0005_center.sql
-- What: the center's own profile — a single synced row per center database.
-- Why:  SOU-28. Shown in Settings and on the invoice PDF header; `plan` is the
--       interim gate source (SOU-98 moves plan authority to a license file and
--       demotes this column to a display-only mirror).
-- Rollback: additive-only. Logical undo is DROP TABLE center; never applied to a
--       released DB in place.
-- First ships in: v2.0.0.
--
-- SYNCED entity (unlike the device-local auth/app_meta tables): carries the full
-- envelope so name/address/logo/contact converge across the center's laptops.
-- Not people-like → no natural_key. Soft-delete only (a center is never hard-
-- deleted). The `singleton` column + its UNIQUE index enforce one row per file;
-- `plan` is CHECK-constrained to the known tiers.

CREATE TABLE center (
  id            TEXT PRIMARY KEY,             -- ULID with 'ctr_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  name          TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  logo_path     TEXT,                         -- relative path under app data; NULL when unset
  plan          TEXT NOT NULL DEFAULT 'essentiel',  -- interim gate source (SOU-98)
  singleton     INTEGER NOT NULL DEFAULT 1,   -- one center row per DB file
  CHECK (id LIKE 'ctr\_%' ESCAPE '\'),
  CHECK (plan IN ('essentiel', 'pro', 'premium')),
  CHECK (singleton = 1)
);

CREATE UNIQUE INDEX ux_center_singleton ON center(singleton);
CREATE INDEX ix_center_updated_at ON center(updated_at);
CREATE INDEX ix_center_center     ON center(center_code, deleted_at);
