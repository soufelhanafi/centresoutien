-- 0020_sessions.sql
-- What: sessions table — the concrete, dated occurrences the SOU-56 generator
--       materializes from a weekly_recurring_sessions template (room + optional
--       teacher + time range, pinned to one calendar date). This is the row a
--       calendar day column shows and that attendance (SOU-57) hangs off.
-- Why:  SOU-129. Closes the Epic 6 gap: SOU-53 shipped the recurring *template*
--       table, SOU-56 the pure generator (nowhere to persist), SOU-57 assumes
--       these rows exist as an FK target. This is their storage + idempotency key.
-- First ships in: v2.0.0.
--
-- Not people-like: an occurrence is identified by its RELATIONSHIPS, not a
-- matching key, so it carries NO natural_key. Its natural identity is
-- (recurring_session_id, date) — enforced by the UNIQUE index below, which is the
-- dedup key that makes generation idempotent. Soft-delete only — cancelling one
-- occurrence sets deleted_at; a tombstoned row still syncs. Envelope columns
-- follow the standard template (order preserved), mirroring 0010.
--
-- No foreign keys, by convention (see 0008_students / 0010): a referenced row
-- (the recurrence template, the room, later the teacher) may legitimately arrive
-- on another device after this one via sync, so a hard FK would reject a valid
-- insert. recurring_session_id / room_id / teacher_id are plain id columns.
-- teacher_id additionally has no table to reference yet — the Teacher entity is
-- not built; the column is nullable TEXT and gains its FK/brand later.
--
-- date is a strict 'YYYY-MM-DD' civil date (compares lexically = chronologically).
-- start_time / end_time are 'HH:mm' text (TimeOfDay VO); zero-padded so lexical
-- comparison matches chronological.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE sessions;

CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,             -- ULID with 'ses_' prefix
  center_code         TEXT NOT NULL,
  device_origin       TEXT NOT NULL,
  created_at          TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at          TEXT NOT NULL,
  updated_by          TEXT NOT NULL,                -- user ULID of last editor
  deleted_at          TEXT,                         -- NULL when alive; soft delete only
  version             INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  recurring_session_id TEXT NOT NULL,               -- WeeklyRecurringSessionId ('wrs_…'); no FK (sync-order safe)
  room_id             TEXT NOT NULL,                -- RoomId ('rom_…'); no FK (sync-order safe)
  teacher_id          TEXT,                         -- EntityId ('tch_…'); NULL when unassigned
  date                TEXT NOT NULL,                -- 'YYYY-MM-DD' civil date of this occurrence
  start_time          TEXT NOT NULL,                -- 'HH:mm'
  end_time            TEXT NOT NULL,                -- 'HH:mm', strictly after start_time
  CHECK (id LIKE 'ses\_%' ESCAPE '\'),
  CHECK (end_time > start_time)
);

CREATE INDEX ix_sessions_updated_at ON sessions(updated_at);
CREATE INDEX ix_sessions_center     ON sessions(center_code, deleted_at);

-- The natural key = the idempotency key. UNIQUE and deliberately NOT partial
-- (no `WHERE deleted_at IS NULL`): a tombstone MUST keep occupying its
-- (recurring_session_id, date) slot so the generator's
-- `INSERT … ON CONFLICT(recurring_session_id, date) DO NOTHING` re-run collides on
-- a cancelled date and leaves it cancelled — regeneration never resurrects a
-- removed occurrence. This is the opposite of the people-like partial natural-key
-- index, which intentionally ALLOWS recreate-after-soft-delete.
CREATE UNIQUE INDEX ux_sessions_recurrence_date ON sessions(recurring_session_id, date);

-- Calendar/day reads (SOU-129 listForRange, later the calendar grid): scan by
-- date, and by room within a day.
CREATE INDEX ix_sessions_date      ON sessions(date);
CREATE INDEX ix_sessions_room_date ON sessions(room_id, date);
