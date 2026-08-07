-- 0015_groups.sql
-- What: groups table — a class the center runs (one subject, optional teacher, a
--       level, a seat capacity, a regular/exam-prep track).
-- Why:  SOU-120. The Group domain (entity + port + CreateGroup) landed in SOU-48;
--       this migration + its SQLite adapter give it persistence, mirroring the
--       SOU-32 (Room domain) → SOU-33 (Room repo) split.
-- First ships in: v2.0.0.
--
-- Not people-like: a group is identified by its relationships, not by a matching
-- key, so it carries NO natural_key and no unique index. Soft-delete only —
-- archiving sets deleted_at; a tombstoned row still syncs. Envelope columns
-- follow the standard template (order preserved).
--
-- No FKs (sync-order safe, per 0008/0010): a group can arrive before the subject
-- it points at during a pull, so the relationship is enforced in the domain use
-- case, not by the schema. teacher_id stays nullable until SOU-36 (Teacher
-- domain) lands; add the FK/brand then. Rooms are not attached to a group — they
-- are chosen at session creation (SOU-176).
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE groups;
--
-- EDIT NOTICE (SOU-176): the original draft of this file carried a NOT NULL
-- room_id column; it was removed in place BEFORE v2.0.0 ever shipped (no
-- released build contains it). Local dev/scratch databases created from the old
-- draft still have the column and will fail every group INSERT — recreate them.

CREATE TABLE groups (
  id            TEXT PRIMARY KEY,             -- ULID with 'grp_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  subject_id    TEXT NOT NULL,                -- ULID with 'sub_' prefix (no FK, sync-order safe)
  teacher_id    TEXT,                         -- ULID 'tch_' prefix; nullable until SOU-36
  level         TEXT NOT NULL,                -- plain label, e.g. "2ème Bac" (not translated)
  capacity      INTEGER NOT NULL,             -- seat ceiling
  kind          TEXT NOT NULL,                -- 'regular' | 'exam-prep'
  active        INTEGER NOT NULL DEFAULT 1,   -- boolean 0/1
  CHECK (id LIKE 'grp\_%' ESCAPE '\'),
  CHECK (capacity >= 1),
  CHECK (kind IN ('regular', 'exam-prep')),
  CHECK (active IN (0, 1))
);

CREATE INDEX ix_groups_updated_at ON groups(updated_at);
CREATE INDEX ix_groups_center     ON groups(center_code, deleted_at);
CREATE INDEX ix_groups_subject    ON groups(subject_id, deleted_at);
