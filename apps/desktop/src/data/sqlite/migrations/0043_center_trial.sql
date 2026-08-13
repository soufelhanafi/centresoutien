-- 0043_center_trial.sql
-- What: device-local trial state for a newly created center.
-- Why:  SOU-246 grants one personal-sale 14-day trial per center without
--       backfilling existing centers or synchronizing a local entitlement.
-- First ships in: v2.0.0.
--
-- No migration backfill is intentional. Existing center databases retain no
-- trial row and therefore remain locked unless they carry a valid license.

CREATE TABLE center_trial (
  singleton    INTEGER PRIMARY KEY CHECK (singleton = 1),
  started_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
