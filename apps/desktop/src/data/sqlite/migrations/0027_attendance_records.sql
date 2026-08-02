-- 0027_attendance_records.sql
-- What: attendance_records table — one student's roll-call outcome
--       (present | absent | excused | late) for one concrete session
--       (CLAUDE.md §6/§9). Attendance never affects invoicing; billing stays
--       monthly, per StudentSubscription, regardless of who showed up.
-- Why:  SOU-57. Storage for the AttendanceRecord domain, unblocking SOU-58
--       (roll-call capture UI) and SOU-100 / SOU-108 (attendance reporting).
-- First ships in: v2.0.0.
--
-- Not people-like: a record is identified by its RELATIONSHIPS
-- (session_id, student_id), not a matching key, so it carries NO natural_key.
-- Soft-delete only. Envelope columns follow the standard template (order
-- preserved, mirroring 0020_sessions).
--
-- ⚠️ NO UNIQUE(session_id, student_id): unlike sessions' generator-idempotency
-- key, this pair is a domain-owned "at most one live record" invariant, not a
-- DB constraint — two laptops taking roll-call for the same session before a
-- sync must converge on sync-resolve rather than reject the push (same
-- rationale as 0016_enrollments' missing UNIQUE(student_id, group_id)).
--
-- Mutable, not append-only, unlike payments: a same-day roll-call correction
-- updates status/note on the existing row in place.
--
-- No FKs, by convention (see 0008/0016/0020): session_id / student_id may
-- legitimately arrive before their referenced rows during a sync pull.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE attendance_records;

CREATE TABLE attendance_records (
  id            TEXT PRIMARY KEY,             -- ULID with 'att_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  session_id    TEXT NOT NULL,                -- ULID 'ses_' prefix (no FK, sync-order safe)
  student_id    TEXT NOT NULL,                -- ULID 'stu_' prefix (no FK, sync-order safe)
  status        TEXT NOT NULL,                -- 'present' | 'absent' | 'excused' | 'late'
  note          TEXT,                         -- free-form note; NULL when none
  CHECK (id LIKE 'att\_%' ESCAPE '\'),
  CHECK (status IN ('present', 'absent', 'excused', 'late'))
);

CREATE INDEX ix_attendance_records_updated_at ON attendance_records(updated_at);
CREATE INDEX ix_attendance_records_center     ON attendance_records(center_code, deleted_at);

-- Roll-call roster read (listBySession).
CREATE INDEX ix_attendance_records_session ON attendance_records(session_id, deleted_at);

-- Per-student aggregate read (summarizeForStudent), joined against sessions.date.
CREATE INDEX ix_attendance_records_student ON attendance_records(student_id, deleted_at);
