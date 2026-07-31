-- 0016_enrollments.sql
-- What: enrollments table — the small joining row that places a student in a group
--       (CLAUDE.md §7). It carries NO fee: a student pays for a Formula via their
--       StudentSubscription; the group is only where they learn, and the enrollment
--       is the attendance link.
-- Why:  SOU-126. The Enrollment domain (entity + port + EnrollStudent/UnenrollStudent
--       with the capacity/cross-kind/duplicate guards) landed in SOU-121 + SOU-123
--       with no persistence; this migration + its SQLite adapter give it storage,
--       mirroring the SOU-120 / 0015_groups.sql split for Groups.
-- First ships in: v2.0.0.
--
-- Not people-like: an enrollment is identified by its relationships (student +
-- group), not by a matching key, so it carries NO natural_key and NO natural-key
-- index. Soft-delete only — unenrolling sets deleted_at; a tombstoned row still
-- syncs and frees its seat. Envelope columns follow the standard template (same
-- column order as 0015_groups.sql).
--
-- ⚠️ NO UNIQUE(student_id, group_id): duplicate prevention deliberately lives in
-- the domain (SOU-123 hasActiveEnrollment + the adapter's atomic saveIfAbsent), not
-- in a DB constraint. A benign double-click, or two laptops enrolling the same
-- student before a sync, must *converge* to one live row on sync-resolve — a unique
-- index here would instead reject the sync push and break replication. This is a
-- hard requirement, not a preference.
--
-- No FKs (sync-order safe, per 0008/0010/0015): an enrollment can arrive before the
-- student or group it points at during a pull, so the relationship is enforced in
-- the domain use case, not by the schema.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE enrollments;

CREATE TABLE enrollments (
  id            TEXT PRIMARY KEY,             -- ULID with 'enr_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  student_id    TEXT NOT NULL,                -- ULID with 'stu_' prefix (no FK, sync-order safe)
  group_id      TEXT NOT NULL,                -- ULID with 'grp_' prefix (no FK, sync-order safe)
  start_month   TEXT NOT NULL,                -- inclusive 'YYYY-MM'
  end_month     TEXT,                         -- inclusive 'YYYY-MM', or NULL when open-ended
  CHECK (id LIKE 'enr\_%' ESCAPE '\'),
  -- Mirrors the domain invariant (endMonth may not precede startMonth); can never
  -- reject a valid domain write, so it never rejects a sync push either.
  CHECK (end_month IS NULL OR end_month >= start_month)
);

CREATE INDEX ix_enrollments_updated_at ON enrollments(updated_at);            -- backs listChangedSince (sync feed)
CREATE INDEX ix_enrollments_group      ON enrollments(group_id, deleted_at);  -- backs listActiveByGroup / countActiveByGroup / hasActiveEnrollment
CREATE INDEX ix_enrollments_student    ON enrollments(student_id, deleted_at);-- backs listActiveByStudent / hasActiveEnrollment
