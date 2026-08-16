-- 0046_niveaux.sql
-- What: niveaux table — the per-center catalog of grade levels (1AP, 1AC,
--       2ème Bac SVT…) + the nullable niveau retrofit columns on students,
--       groups, and teachers.
-- Why:  SOU-260. Level taxonomy: a typed `Niveau` axis replaces/augments the
--       free-text `level` label on students/groups and adds a many-to-many
--       niveau set on teachers.
-- First ships in: v2.1.0 (or the release carrying SOU-260).
--
-- Not people-like → no natural_key. Soft-delete only: a niveau referenced by a
-- live student, group, or teacher is deactivated (active = 0) or kept, never
-- hard-deleted (the `ArchiveNiveau` in-use guard rejects the tombstone). Code is
-- optional but, when present, unique per center among live rows — the partial
-- unique index frees a code on archive, exactly like subjects (0014).
--
-- Additive only, sync-neutral: the new columns are nullable / DEFAULT-filled, so
-- no existing row is touched and no updated_at/version is bumped — every replica
-- converges to the same NULLs/'[]' on its own, zero sync traffic. No FK on the
-- reference columns (sync-order safe: a pulled niveau may arrive after the
-- student/group/teacher that references it), matching subjects.groups.
--
-- The default Moroccan catalog is NOT seeded here: like subjects, a fresh center
-- bootstraps it through the center-setup unit of work (SaveCenterProfile), so
-- the migration stays a pure schema change that replays identically on existing
-- centers without colliding with any level the admin already created.

CREATE TABLE niveaux (
  id            TEXT PRIMARY KEY,             -- ULID with 'niv_' prefix
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
  code          TEXT,                         -- optional short code; NULL = no code
  category      TEXT NOT NULL,                -- 'primaire' | 'college' | 'lycee'
  active        INTEGER NOT NULL DEFAULT 1,   -- enable/archive toggle; 0/1 boolean
  CHECK (id LIKE 'niv\_%' ESCAPE '\'),
  CHECK (category IN ('primaire', 'college', 'lycee')),
  CHECK (active IN (0, 1))
);

CREATE INDEX ix_niveaux_updated_at ON niveaux(updated_at);
CREATE INDEX ix_niveaux_center     ON niveaux(center_code, deleted_at);

-- Per-center code uniqueness among live rows; a code freed by archiving is reusable.
CREATE UNIQUE INDEX ux_niveaux_code
  ON niveaux(center_code, code)
  WHERE code IS NOT NULL AND deleted_at IS NULL;

-- Student/group level taxonomy (SOU-260): nullable, no FK (sync-order safe).
ALTER TABLE students ADD COLUMN niveau_id TEXT;
ALTER TABLE groups    ADD COLUMN niveau_id TEXT;

-- Teacher level coverage (SOU-260): JSON array of NiveauId, mirroring
-- teachers.subject_ids / students.guardian_ids. DEFAULT '[]' backfills existing
-- teachers to "no level coverage" without touching updated_at/version.
ALTER TABLE teachers ADD COLUMN niveau_ids TEXT NOT NULL DEFAULT '[]';
