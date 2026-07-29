-- 0005_center_hours.sql
-- What: center_hours table — per-weekday opening hours for a center (SOU-29).
-- Why:  scheduling rejects out-of-hours sessions (wired at the calendar seam in
--       SOU-55); the Settings screen edits the seven weekday rows.
-- First ships in: v2.0.0.
--
-- One row per (center_code, day_of_week), 0=Sunday … 6=Saturday. Each weekday is
-- an independent, independently-versioned entity so Monday-vs-Tuesday edits on
-- two laptops merge field-cleanly. A closed day is open IS NULL AND close IS NULL
-- (the CHECK forbids the half-set state); times are 'HH:mm' 24h, validated by the
-- domain schema. No backfill: a fresh center has no rows and the domain supplies
-- DEFAULT_WEEKLY_HOURS for the user to review and save. Envelope columns follow
-- the standard template (order preserved). Not people-like → no natural_key.

CREATE TABLE center_hours (
  id            TEXT PRIMARY KEY,             -- ULID with 'chr_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  day_of_week   INTEGER NOT NULL,             -- 0=Sunday … 6=Saturday
  open          TEXT,                         -- 'HH:mm' 24h; NULL when closed
  close         TEXT,                         -- 'HH:mm' 24h; NULL when closed
  CHECK (id LIKE 'chr\_%' ESCAPE '\'),
  CHECK (day_of_week BETWEEN 0 AND 6),
  CHECK ((open IS NULL) = (close IS NULL))    -- both null (closed) or both set
);

CREATE INDEX ix_center_hours_updated_at ON center_hours(updated_at);
CREATE INDEX ix_center_hours_center     ON center_hours(center_code, deleted_at);

-- One live row per weekday per center. Partial (WHERE deleted_at IS NULL) so a
-- soft-deleted row never blocks re-creating that weekday.
CREATE UNIQUE INDEX ux_center_hours_day
  ON center_hours(center_code, day_of_week)
  WHERE deleted_at IS NULL;
