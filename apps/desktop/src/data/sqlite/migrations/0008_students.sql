-- 0008_students.sql
-- What: students table — the per-center roster of enrolled students.
-- Why:  first People entity (SOU-38); parents (SOU-40), links (SOU-42), and
--       enrollments build on it.
-- First ships in: v2.0.0.
--
-- People-like, so it carries natural_key — the fast exact-match tier of the
-- parents-first duplicate engine (SOU-92). The index on it is deliberately
-- NON-unique: two children with the same normalized name + birth date can
-- legitimately belong to different families (the parent is the real
-- discriminator), so duplicates are flagged, never blocked at the DB.
--
-- guardian_ids is a JSON array of ParentId ('prt_…'). The many-to-many link lives
-- as a single field on the student so it syncs as one entry in the change log and
-- needs no foreign key to a parents table that does not exist yet (SOU-40).
--
-- Soft-delete only. Envelope columns follow the standard template (order preserved).
-- Rollback: additive-only. Logical undo is DROP TABLE students;

CREATE TABLE students (
  id            TEXT PRIMARY KEY,             -- ULID with 'stu_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  natural_key   TEXT NOT NULL,                -- centerCode::normName::birthDate (immutable)
  -- domain fields --
  name_fr       TEXT NOT NULL,
  name_ar       TEXT NOT NULL,
  birth_date    TEXT NOT NULL,                -- 'YYYY-MM-DD'
  level         TEXT NOT NULL,                -- grade label, center-defined
  school        TEXT,                         -- external school; NULL when unknown
  notes         TEXT,                         -- free notes; NULL when none
  guardian_ids  TEXT NOT NULL DEFAULT '[]',   -- JSON array of ParentId ('prt_…')
  CHECK (id LIKE 'stu\_%' ESCAPE '\')
);

CREATE INDEX ix_students_updated_at  ON students(updated_at);
CREATE INDEX ix_students_center      ON students(center_code, deleted_at);
-- Non-unique on purpose: a matching hint for dedup, not a uniqueness constraint.
CREATE INDEX ix_students_natural_key ON students(center_code, natural_key);
