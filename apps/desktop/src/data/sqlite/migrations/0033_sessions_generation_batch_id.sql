-- 0033_sessions_generation_batch_id.sql
-- What: add nullable generation_batch_id to sessions (the concrete dated
--       occurrences) + ix_sessions_generation_batch.
-- Why:  SOU-160. Every generator run (SOU-158/129) now stamps every occurrence
--       it materializes with one fresh generationBatchId, so an admin can
--       bulk-cancel or undo an entire misconfigured run without hunting
--       individual sessions. The generator's persistence-level upsert
--       (ON CONFLICT(recurring_session_id, date) DO NOTHING) already leaves a
--       previously-stored row's columns untouched on a collision, so a re-run
--       never overwrites an existing row's original batch id — only newly
--       inserted rows carry the new run's tag.
-- First ships in: v2.2.0.
--
-- Additive-only. New nullable column on an existing table; existing rows keep
-- NULL, which is exactly correct — a session materialized before this ticket
-- was never part of a tracked batch. No backfill: there is no deterministic
-- per-row source for which historical run produced an already-stored session.
--
-- No FK, by convention (see 0010/0015/0021/0029): generation_batch_id is not a
-- reference to a stored entity (there is no batch table — it is a grouping tag
-- minted by the domain generator), so a hard FK would be meaningless here too.
--
-- ix_sessions_generation_batch indexes the new column for the SOU-160 bulk-undo
-- lookup (every live session sharing one batch id).
--
-- Logical undo is DROP INDEX ix_sessions_generation_batch; (the column stays — additive-only).

ALTER TABLE sessions ADD COLUMN generation_batch_id TEXT;  -- ULID 'gen_' prefix; NULL for rows that predate SOU-160

CREATE INDEX IF NOT EXISTS ix_sessions_generation_batch ON sessions(generation_batch_id);
