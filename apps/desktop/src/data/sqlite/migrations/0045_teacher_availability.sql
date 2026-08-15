-- 0045_teacher_availability.sql
-- What: teacher_availability (weekly teaching windows per teacher) and
--       teacher_availability_exceptions (one-off date-range absences) — SOU-259.
-- Why:  directors declare when a teacher can actually teach; the session
--       generator and the preview flag out-of-window placements as forceable
--       warnings (SOU-189 style) instead of discovering the clash after the fact.
-- First ships in: v2.0.0.
--
-- teacher_availability holds AT MOST ONE live row per (center_code, teacher_id)
-- — absence of a row means the teacher is unrestricted. weekly_windows is a JSON
-- object keyed "0".."6" (0=Sunday … 6=Saturday); each value is an ordered,
-- non-overlapping array of { "open": "HH:mm", "close": "HH:mm" } — an empty
-- array is a whole day off. Shape + ordering invariants are enforced by the
-- domain schema (shared with center_hours_overrides); SQLite stores the
-- validated JSON text.
--
-- teacher_availability_exceptions holds one row per absence: an inclusive civil
-- date range ('YYYY-MM-DD', single-day = start == end) plus an optional
-- free-text label. Not people-like: neither table carries a natural_key —
-- identity is the teacher reference, not a matching key. Soft-delete only.
-- Envelope columns follow the standard template (order preserved).
--
-- Additive-only. No backfill (new tables). Logical undo is DROP TABLE for both.

CREATE TABLE teacher_availability (
  id             TEXT PRIMARY KEY,             -- ULID with 'tav_' prefix
  center_code    TEXT NOT NULL,
  device_origin  TEXT NOT NULL,
  created_at     TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL,                -- user ULID of last editor
  deleted_at     TEXT,                         -- NULL when alive; soft delete only
  version        INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  teacher_id     TEXT NOT NULL,                -- ULID with 'tch_' prefix
  weekly_windows TEXT NOT NULL,                -- JSON: 7 ordered non-overlapping window lists
  CHECK (id LIKE 'tav\_%' ESCAPE '\'),
  CHECK (teacher_id LIKE 'tch\_%' ESCAPE '\')
);

CREATE INDEX ix_teacher_availability_updated_at ON teacher_availability(updated_at);
CREATE INDEX ix_teacher_availability_center     ON teacher_availability(center_code, deleted_at);
-- The one-live-row-per-teacher invariant the domain upsert relies on.
CREATE UNIQUE INDEX ux_teacher_availability_teacher
  ON teacher_availability(center_code, teacher_id) WHERE deleted_at IS NULL;

CREATE TABLE teacher_availability_exceptions (
  id            TEXT PRIMARY KEY,              -- ULID with 'tae_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                 -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                 -- user ULID of last editor
  deleted_at    TEXT,                          -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,    -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  teacher_id    TEXT NOT NULL,                 -- ULID with 'tch_' prefix
  start_date    TEXT NOT NULL,                 -- inclusive 'YYYY-MM-DD'
  end_date      TEXT NOT NULL,                 -- inclusive 'YYYY-MM-DD', >= start_date
  label         TEXT,                          -- director's own wording; NULL when unnamed
  CHECK (id LIKE 'tae\_%' ESCAPE '\'),
  CHECK (teacher_id LIKE 'tch\_%' ESCAPE '\'),
  CHECK (end_date >= start_date)
);

CREATE INDEX ix_teacher_availability_exceptions_updated_at
  ON teacher_availability_exceptions(updated_at);
CREATE INDEX ix_teacher_availability_exceptions_center
  ON teacher_availability_exceptions(center_code, deleted_at);
CREATE INDEX ix_teacher_availability_exceptions_teacher
  ON teacher_availability_exceptions(center_code, teacher_id, deleted_at);
-- Range-intersection scans (the generator's listOverlapping) filter live rows of
-- a center by start_date/end_date; this composite keeps that lookup off a table scan.
CREATE INDEX ix_teacher_availability_exceptions_range
  ON teacher_availability_exceptions(center_code, deleted_at, start_date, end_date);
