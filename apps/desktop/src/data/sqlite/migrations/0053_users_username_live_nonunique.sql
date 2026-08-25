-- 0053_users_username_live_nonunique.sql
-- What: relax the per-center live-username uniqueness on `users` from a HARD
--       unique index (`ux_users_username_live`, migration 0044) to a plain,
--       non-unique lookup index (`ix_users_username_live`).
-- Why:  `users` is a synced entity (0044) and, since SOU-258, the owner
--       credential replicates. Two laptops that each run first-run and
--       create the owner (same username, e.g. `directrice`) mint DISTINCT ULIDs
--       for the SAME account; on the first sync the second device projects the
--       peer's row with `ON CONFLICT(id)` — a fresh id, so a plain INSERT — which
--       the unique index rejects with `UNIQUE constraint failed:
--       users.center_code, users.username_normalized`, ABORTING the whole
--       sync-apply batch (every entity in the pull fails, not just the owner).
--       This is the same sync-hostile pattern SOU-259 removed from
--       teacher_availability (0045) and that enrollments/invoices deliberately
--       avoid: a unique index on a synced business key rejects the push and
--       breaks replication. The at-most-one-live-account-per-username invariant
--       stays enforced where it belongs — the domain create/redeem use cases
--       (application-level pre-check + an in-transaction re-check in
--       markSetupCodeRedeemed), never a DB constraint that aborts a peer apply.
--       Two rows that still collide across devices are converged at READ time:
--       every user read resolves the deterministic winner (greatest id, the same
--       rule teacher_availability / center_hours_overrides use), so all devices
--       agree and the owner-credential write always targets the same row.
--       Siblings: SOU-122 (subjects) and SOU-188 (sessions) fixed the same
--       class for their entities; SOU-258 (owner replication) is what turned this
--       latent 0044 hazard into a nightly-red multi-laptop sync failure.
-- Rollback: additive-in-effect (index swap only, no data touched). Logical undo
--       is recreating the unique index — never applied to a released DB in place,
--       and impossible once a real cross-device duplicate exists.
-- First ships in: v2.x.
--
-- IF EXISTS / IF NOT EXISTS keep replay idempotent: a DB migrated from any prior
-- version reaches head cleanly, and re-running this file is a no-op. No row is
-- read or written, so no updated_at / version / change_log is bumped — the swap
-- is pure schema and generates zero sync traffic.

DROP INDEX IF EXISTS ux_users_username_live;

-- Non-unique: two devices' first-creates of the same username must both project;
-- the greatest-id read rule arbitrates. Still partial on live rows so a
-- tombstoned username does not weigh on the lookup path login queries.
CREATE INDEX IF NOT EXISTS ix_users_username_live
  ON users(center_code, username_normalized)
  WHERE deleted_at IS NULL;
