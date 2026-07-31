-- 0012_holidays.sql
-- What: holidays table — days the center is closed (solar/fixed + lunar/manual).
-- Why:  SOU-30. The Holiday domain (entity + CRUD use cases + notOnHoliday policy)
--       landed alongside; this migration + its SQLite adapter give it persistence.
-- First ships in: v2.0.0.
--
-- Not people-like: a holiday is identified by its dates and name, not a matching
-- key, so it carries NO natural_key and no unique index. Soft-delete only —
-- archiving sets deleted_at; a tombstoned row still syncs. Envelope columns
-- follow the standard template (order preserved).
--
-- kind: 'fixed' recurs every year on the same Gregorian month-day; 'lunar' is
-- entered manually for one specific year (no Hijri computation — CLAUDE.md §6).
-- start_date/end_date are inclusive civil dates ('YYYY-MM-DD'); a single-day
-- holiday has start_date == end_date. affects_invoicing is NOT stored — it is an
-- invariant constant (holidays never change billing), enforced in the domain.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE holidays;

CREATE TABLE holidays (
  id            TEXT PRIMARY KEY,             -- ULID with 'hol_' prefix
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
  kind          TEXT NOT NULL,                -- 'fixed' | 'lunar'
  start_date    TEXT NOT NULL,                -- inclusive 'YYYY-MM-DD'
  end_date      TEXT NOT NULL,                -- inclusive 'YYYY-MM-DD', >= start_date
  CHECK (id LIKE 'hol\_%' ESCAPE '\'),
  CHECK (kind IN ('fixed', 'lunar')),
  CHECK (end_date >= start_date)
);

CREATE INDEX ix_holidays_updated_at ON holidays(updated_at);
CREATE INDEX ix_holidays_center     ON holidays(center_code, deleted_at);
