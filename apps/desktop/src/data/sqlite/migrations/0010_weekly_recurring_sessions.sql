-- 0010_weekly_recurring_sessions.sql
-- What: weekly_recurring_sessions table — the recurring weekly slots the planner
--       grid schedules (a room + optional teacher, one weekday, a time range).
-- Why:  SOU-53. Persists the WeeklyRecurringSession entity; its indexes serve the
--       composite conflict detector (SOU-55: room + teacher overlap per weekday)
--       and back the ArchiveRoom in-use guard (RoomReferencePort).
-- First ships in: v2.0.0.
--
-- Not people-like: a session is identified by its relationships, not a matching
-- key, so it carries NO natural_key and no unique index. Soft-delete only —
-- unscheduling sets deleted_at; a tombstoned row still syncs. Envelope columns
-- follow the standard template (order preserved).
--
-- No foreign keys, by convention (see 0008_students): a referenced row (room, and
-- later teacher) may legitimately arrive on another device after this one via
-- sync, so a hard FK would reject a valid insert. room_id / teacher_id are plain
-- id columns. teacher_id additionally has no table to reference yet — the Teacher
-- entity is not built; the column is nullable TEXT and gains its FK/brand later.
--
-- start_time / end_time are 'HH:mm' text (TimeOfDay VO); zero-padded so lexical
-- comparison matches chronological. day_of_week is 0=Sun … 6=Sat (Date.getUTCDay).
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE
-- weekly_recurring_sessions;

CREATE TABLE weekly_recurring_sessions (
  id            TEXT PRIMARY KEY,             -- ULID with 'wrs_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  room_id       TEXT NOT NULL,                -- RoomId ('rom_…'); no FK (sync-order safe)
  teacher_id    TEXT,                         -- EntityId ('…'); NULL when unassigned
  day_of_week   INTEGER NOT NULL,             -- 0=Sun … 6=Sat
  start_time    TEXT NOT NULL,                -- 'HH:mm'
  end_time      TEXT NOT NULL,                -- 'HH:mm', strictly after start_time
  CHECK (id LIKE 'wrs\_%' ESCAPE '\'),
  CHECK (day_of_week BETWEEN 0 AND 6),
  CHECK (end_time > start_time)
);

CREATE INDEX ix_wrs_updated_at ON weekly_recurring_sessions(updated_at);
CREATE INDEX ix_wrs_center     ON weekly_recurring_sessions(center_code, deleted_at);
-- Conflict-detection reads (SOU-55): overlap is scoped per weekday, per room /
-- per teacher. These two composite indexes make listRefsForDay a bounded scan.
CREATE INDEX ix_wrs_day_room    ON weekly_recurring_sessions(day_of_week, room_id);
CREATE INDEX ix_wrs_day_teacher ON weekly_recurring_sessions(day_of_week, teacher_id);
