-- 0021_wrs_group_id.sql
-- What: add nullable group_id to weekly_recurring_sessions + ix_wrs_group.
-- Why:  SOU-118. The planner grid's enriched read model (WeeklySessionView) derives
--       a session's subject / level / kind from its Group, but a
--       WeeklyRecurringSession had no link to one (it only carried room/teacher/day/
--       time). This column is that link; the read model LEFT JOINs groups (→
--       subjects) on it. The concrete dated `sessions` table gets its own group_id
--       separately in SOU-130 (blocked by this).
-- First ships in: v2.0.0.
--
-- Additive-only. New nullable column on an existing table; existing rows keep NULL
-- (a session with no group → neutral fallback in the read model: kind 'regular', no
-- subject/level). No backfill — there is no deterministic per-row source for the
-- link, so it is populated through the normal write path (where updated_at/version
-- bumps are correct), never in a migration. No DEFAULT needed: nullable.
--
-- No FK, by convention (see 0010/0015): a group can arrive on another device after
-- this row via sync, so a hard FK would reject a valid insert. group_id is a plain
-- nullable id column ('grp_…'); the relationship is enforced in the domain.
--
-- ix_wrs_group indexes the new column for the read-model join and future
-- "sessions of a group" reverse lookups.
--
-- Logical undo is DROP INDEX ix_wrs_group; (the column stays — additive-only).

ALTER TABLE weekly_recurring_sessions ADD COLUMN group_id TEXT;  -- ULID 'grp_' prefix; NULL when unlinked; no FK (sync-order safe)

CREATE INDEX IF NOT EXISTS ix_wrs_group ON weekly_recurring_sessions(group_id);
