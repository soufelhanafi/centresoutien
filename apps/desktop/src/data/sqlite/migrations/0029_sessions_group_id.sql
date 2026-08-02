-- 0029_sessions_group_id.sql
-- What: add nullable group_id to sessions (the concrete dated occurrences) +
--       ix_sessions_group.
-- Why:  SOU-130. SOU-118 gave the weekly_recurring_sessions *template* a
--       group_id so the planner grid's read model can derive subject/level/kind
--       from the Group. This is the same link on the concrete dated `sessions`
--       row, so Epic 6 consumers that read a materialized occurrence (SOU-57
--       attendance, SOU-108 reporting, SOU-107 print, SOU-100 dashboard) can
--       join on it without re-deriving it from the recurrence at read time. The
--       SOU-56 generator (generate-sessions.ts) sets it at materialization from
--       the template's own group_id — a concrete session never carries a group
--       the template lacks.
-- First ships in: v2.0.0.
--
-- Additive-only. New nullable column on an existing table; existing rows keep
-- NULL. No backfill — there is no deterministic per-row source for the link
-- (the row's own recurring_session_id points at a template that itself may
-- still be NULL), and re-running the SOU-56 generator over already-materialized
-- dates is a no-op (upsertMany dedups on the natural key and leaves stored rows
-- untouched), so an already-persisted session's group_id can only be backfilled
-- through the normal write path. No DEFAULT needed: nullable.
--
-- No FK, by convention (see 0010/0015/0021): a group can arrive on another
-- device after this row via sync, so a hard FK would reject a valid insert.
-- group_id is a plain nullable id column ('grp_…'); the relationship is
-- enforced in the domain.
--
-- ix_sessions_group indexes the new column for the SOU-57/107/108/100 join and
-- "sessions of a group" reverse lookups.
--
-- Logical undo is DROP INDEX ix_sessions_group; (the column stays — additive-only).

ALTER TABLE sessions ADD COLUMN group_id TEXT;  -- ULID 'grp_' prefix; NULL when unlinked; no FK (sync-order safe)

CREATE INDEX IF NOT EXISTS ix_sessions_group ON sessions(group_id);
