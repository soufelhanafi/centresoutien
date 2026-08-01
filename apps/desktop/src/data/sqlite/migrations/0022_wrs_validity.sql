-- 0022_wrs_validity.sql
-- What: add active / valid_from / valid_to to weekly_recurring_sessions.
-- Why:  SOU-52. The WeeklyRecurringSession template gains a pause toggle (active)
--       and a validity window (valid_from / valid_to). The entity + its
--       invariant-enforcing factory (start < end, validFrom <= validTo, active
--       defaulting) land in packages/domain; these columns persist the new fields.
-- First ships in: v2.0.0.
--
-- Additive-only. Three new columns on an existing table.
--
-- active: boolean 0/1, NOT NULL DEFAULT 1 — every existing row is a live, active
-- slot, and the domain sets it true on creation (mirrors rooms.active /
-- groups.active). The DEFAULT is what makes this replay-safe on tables that
-- already hold rows. Column-level CHECK constrains it to 0/1 (existing rows
-- already satisfy it via the default).
--
-- valid_from / valid_to: strict 'YYYY-MM-DD' civil dates, compared
-- lexicographically. Both ship NULLABLE with a domain fallback (NULL = unbounded:
-- valid_from NULL is "no lower bound", valid_to NULL is "open-ended"), exactly the
-- migration-authoring rule for a new field with no deterministic per-row source —
-- there is no meaningful date to synthesize for a pre-existing row, so a
-- NOT NULL DEFAULT would be a lie. New rows get their bounds through the normal
-- write path (SOU-131), where updated_at/version bumps are correct. No backfill,
-- so no sync flood: existing rows keep their envelope columns untouched.
--
-- No index on the new columns: SOU-52 does not query by validity (applying the
-- window to conflict detection / the planner read is SOU-55 / SOU-131). Add one
-- with the query that needs it, not speculatively.
--
-- Logical undo is DROP TABLE weekly_recurring_sessions; (additive-only — the
-- columns stay).

ALTER TABLE weekly_recurring_sessions
  ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));  -- boolean 0/1

ALTER TABLE weekly_recurring_sessions
  ADD COLUMN valid_from TEXT;  -- 'YYYY-MM-DD'; NULL = no lower bound

ALTER TABLE weekly_recurring_sessions
  ADD COLUMN valid_to TEXT;    -- 'YYYY-MM-DD'; NULL = open-ended
