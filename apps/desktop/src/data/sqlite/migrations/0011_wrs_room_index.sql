-- 0011_wrs_room_index.sql
-- What: add ix_wrs_room on weekly_recurring_sessions(room_id, deleted_at).
-- Why:  the ArchiveRoom in-use guard (RoomReferencePort.hasActiveSessionForRoom)
--       filters `room_id = ? AND deleted_at IS NULL` — a room_id-only predicate
--       that 0010's ix_wrs_day_room (day_of_week, room_id) cannot serve, since
--       room_id is its second column, so the guard full-scans the table. This
--       dedicated leading-room_id index turns it into a bounded lookup.
--       (migration-guardian note on PR #31; 0010 is merged/immutable, so the fix
--       is an additive follow-up migration, never an edit to 0010.)
-- First ships in: v2.0.0.
--
-- Additive-only. New index on an existing table, no data change. Logical undo is
-- DROP INDEX ix_wrs_room;

CREATE INDEX IF NOT EXISTS ix_wrs_room ON weekly_recurring_sessions(room_id, deleted_at);
