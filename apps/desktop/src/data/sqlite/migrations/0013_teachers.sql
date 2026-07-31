-- 0013_teachers.sql
-- What: teachers table — the per-center list of teachers the center schedules
--       into groups and pays monthly.
-- Why:  SOU-36. People-like entity; the Group (SOU-48) and payroll (SOU-70)
--       tickets link to teachers via teacher_id and read subject_ids.
-- Rollback: additive-only (new table, no backfill). Logical undo is
--       DROP TABLE teachers; never applied to a released DB in place.
-- First ships in: v2.0.0.
--
-- People-like → carries natural_key, with the standard partial UNIQUE index on
-- (center_code, natural_key) WHERE deleted_at IS NULL so an exact duplicate on one
-- device is blocked and sync gets a fast lookup, while a soft-deleted teacher can
-- be recreated. Phone is REQUIRED and stored E.164-normalized (the duplicate
-- anchor, like parents) but is deliberately NOT unique: two teachers sharing a
-- number but with different names produce different natural_keys. Envelope columns
-- follow the standard template (order preserved). Soft-delete only; a teacher is
-- never hard-deleted (in-use guard rejects archiving referenced teachers).
--
-- name_fr / name_ar: bilingual name, like students. cin / email: nullable.
-- subject_ids: JSON array of SubjectId (mirrors students.guardian_ids) — the
-- many-to-many "subjects taught" link stored on the row so it syncs as one
-- change-log entry; no junction table. active: reserved 0/1 flag (lifecycle is
-- driven by deleted_at, like rooms).

CREATE TABLE teachers (
  id              TEXT PRIMARY KEY,             -- ULID with 'tch_' prefix
  center_code     TEXT NOT NULL,
  device_origin   TEXT NOT NULL,
  created_at      TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at      TEXT NOT NULL,
  updated_by      TEXT NOT NULL,                -- user ULID of last editor
  deleted_at      TEXT,                         -- NULL when alive; soft delete only
  version         INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  natural_key     TEXT NOT NULL,                -- matching key; immutable after creation
  -- domain fields --
  name_fr         TEXT NOT NULL,
  name_ar         TEXT NOT NULL,
  cin             TEXT,                          -- Moroccan national ID; NULL when unset
  phone           TEXT NOT NULL,                 -- E.164; required; NOT unique (shared number allowed)
  email           TEXT,                          -- NULL when unset
  subject_ids     TEXT NOT NULL DEFAULT '[]',    -- JSON array of SubjectId
  active          INTEGER NOT NULL DEFAULT 1,    -- reserved 0/1 boolean
  CHECK (id LIKE 'tch\_%' ESCAPE '\'),
  CHECK (active IN (0, 1))
);

CREATE UNIQUE INDEX ux_teachers_natural_key
  ON teachers(center_code, natural_key)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_teachers_updated_at ON teachers(updated_at);
CREATE INDEX ix_teachers_center     ON teachers(center_code, deleted_at);
