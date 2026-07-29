-- 0002_subjects.sql
-- What: subjects table — the per-center list of subjects a center offers.
-- Why:  first domain entity table; formulas and groups will reference it later.
-- First ships in: v2.0.0.
--
-- Subjects are not people-like, so they carry no natural_key. Soft-delete only:
-- a subject referenced by a formula or group is deactivated (active = 0), never
-- hard-deleted. Envelope columns follow the standard template (order preserved).

CREATE TABLE subjects (
  id            TEXT PRIMARY KEY,             -- ULID with 'sub_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  name_fr       TEXT NOT NULL,
  name_ar       TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,   -- 0/1 boolean
  CHECK (id LIKE 'sub\_%' ESCAPE '\'),
  CHECK (active IN (0, 1))
);

CREATE INDEX ix_subjects_updated_at ON subjects(updated_at);
CREATE INDEX ix_subjects_center     ON subjects(center_code, deleted_at);
