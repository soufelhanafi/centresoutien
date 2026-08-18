-- 0046_device_session_user_id.sql
-- What: add `user_id` to the singleton `device_sessions` row — WHICH user the
--       remembered login belongs to.
-- Why:  SOU-265 gives the main process a trusted session principal that survives a
--       remember-me reopen (no fresh login). The device already re-authenticates
--       from this row on restart; stamping the user id lets main recover
--       { userId, role } (resolving the role via the users table) instead of
--       attributing every write to a dev placeholder.
-- Rollback: additive-only. Logical undo is dropping the column; never applied to a
--       released DB in place.
-- First ships in: v2.x (SOU-265).
--
-- LOCAL infra table (like the rest of device_sessions / auth_lockout): no sync
-- envelope, never leaves the device. The column is NULLABLE on purpose — a session
-- remembered on a device upgraded from a pre-0046 build has no user id, so it reads
-- back NULL and degrades to an "unknown principal" (the device re-logs in to
-- re-establish who it is). Replays cleanly from any prior schema version: the table
-- exists since 0004, and adding a nullable column rewrites no existing data.

ALTER TABLE device_sessions ADD COLUMN user_id TEXT;
