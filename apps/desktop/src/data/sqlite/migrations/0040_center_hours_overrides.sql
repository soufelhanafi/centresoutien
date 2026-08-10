-- 0040_center_hours_overrides.sql
-- What: center_hours_overrides table — a time-boxed replacement of the center's
--       weekly opening hours for an inclusive date range (SOU-165, "Ramadan-driven
--       schedule shifts").
-- Why:  during Ramadan (and similar periods) a center runs a different weekly grid
--       — often split by an iftar break into several windows per day. Session
--       generation and the center-hours conflict check consult the active override
--       for a date, taking precedence over the static center_hours rows.
-- First ships in: v2.0.0.
--
-- Not people-like: an override is identified by its dates + weekly windows, not a
-- matching key, so it carries NO natural_key and no unique index. Soft-delete only
-- — archiving sets deleted_at; a tombstoned row still syncs. Envelope columns
-- follow the standard template (order preserved).
--
-- Unlike center_hours (seven independently-versioned weekday rows), an override is
-- ONE row carrying the whole week for its date range: the seven weekdays of one
-- Ramadan are edited and reasoned about together, so the range is the unit.
--
-- start_date/end_date are inclusive civil dates ('YYYY-MM-DD'); a single-day
-- override has start_date == end_date. hours_by_weekday is a JSON object keyed
-- "0".."6" (0=Sunday … 6=Saturday); each value is an ordered, non-overlapping
-- array of { "open": "HH:mm", "close": "HH:mm" } — an empty array is a closed day.
-- The shape + ordering invariants are enforced by the domain schema; SQLite only
-- stores the validated JSON text.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE
-- center_hours_overrides.

CREATE TABLE center_hours_overrides (
  id               TEXT PRIMARY KEY,             -- ULID with 'cho_' prefix
  center_code      TEXT NOT NULL,
  device_origin    TEXT NOT NULL,
  created_at       TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at       TEXT NOT NULL,
  updated_by       TEXT NOT NULL,                -- user ULID of last editor
  deleted_at       TEXT,                         -- NULL when alive; soft delete only
  version          INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  start_date       TEXT NOT NULL,                -- inclusive 'YYYY-MM-DD'
  end_date         TEXT NOT NULL,                -- inclusive 'YYYY-MM-DD', >= start_date
  hours_by_weekday TEXT NOT NULL,                -- JSON: 7 ordered non-overlapping window lists
  CHECK (id LIKE 'cho\_%' ESCAPE '\'),
  CHECK (end_date >= start_date)
);

CREATE INDEX ix_center_hours_overrides_updated_at ON center_hours_overrides(updated_at);
CREATE INDEX ix_center_hours_overrides_center     ON center_hours_overrides(center_code, deleted_at);
-- Range-intersection scans (the generator's listOverlapping) filter live rows of a
-- center by start_date/end_date; this composite keeps that lookup off a table scan.
CREATE INDEX ix_center_hours_overrides_range
  ON center_hours_overrides(center_code, deleted_at, start_date, end_date);
