-- 0007_parents.sql
-- What: parents table — the per-center list of parents/guardians.
-- Why:  SOU-40. The anchor of parents-first duplicate matching; students will
--       link to guardians via a join table added after SOU-38 (Student) merges.
-- Rollback: additive-only. Logical undo is DROP TABLE parents; never applied to a
--       released DB in place.
-- First ships in: v2.0.0.
--
-- People-like → carries natural_key, with the standard partial UNIQUE index on
-- (center_code, natural_key) WHERE deleted_at IS NULL so an exact duplicate on one
-- device is blocked and sync gets a fast lookup, while a soft-deleted guardian can
-- be recreated. Phone is REQUIRED and stored E.164-normalized, but is deliberately
-- NOT unique: a family may share one number across two guardians (different names →
-- different natural_key). Envelope columns follow the standard template (order
-- preserved). Soft-delete only; a guardian is never hard-deleted.

CREATE TABLE parents (
  id              TEXT PRIMARY KEY,             -- ULID with 'prt_' prefix
  center_code     TEXT NOT NULL,
  device_origin   TEXT NOT NULL,
  created_at      TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at      TEXT NOT NULL,
  updated_by      TEXT NOT NULL,                -- user ULID of last editor
  deleted_at      TEXT,                         -- NULL when alive; soft delete only
  version         INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  natural_key     TEXT NOT NULL,                -- matching key; immutable after creation
  -- domain fields --
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,                -- E.164; required; NOT unique (shared family phone allowed)
  email           TEXT,                         -- NULL when unset
  relation        TEXT NOT NULL,                -- enum token; FR/AR labels live in the renderer
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,   -- 0/1 boolean
  CHECK (id LIKE 'prt\_%' ESCAPE '\'),
  CHECK (relation IN ('pere', 'mere', 'tuteur', 'autre')),
  CHECK (whatsapp_opt_in IN (0, 1))
);

CREATE UNIQUE INDEX ux_parents_natural_key
  ON parents(center_code, natural_key)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_parents_updated_at ON parents(updated_at);
CREATE INDEX ix_parents_center     ON parents(center_code, deleted_at);
