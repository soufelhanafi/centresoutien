-- 0029_payment_note.sql
-- What: adds a nullable `note` column to `payments` — a free-text cash-desk
--       annotation ("chèque n°1234", "reste dû reporté"), SOU-101.
-- Why:  SOU-101 KICKOFF locked scope. Purely additive: new column, no backfill (a
--       fresh column on an append-only table has nothing to derive from existing
--       rows), and it does not touch created_at/updated_at/updated_by/version, so
--       it is sync-neutral for every row written before this migration.
-- First ships in: v2.1.0.
--
-- Nullable, no DEFAULT needed: existing rows read `note = NULL`, which is exactly
-- "no annotation was recorded" — the correct historical value, not a placeholder.
-- The append-only triggers from 0019 (trg_payments_no_update / trg_payments_no_delete)
-- are untouched and still forbid mutating this column (or any other) after insert.
--
-- Logical undo: ALTER TABLE payments DROP COLUMN note; (SQLite supports DROP COLUMN
-- since 3.35, but per migration-authoring we never actually ship a drop on a live
-- column — this line documents intent only).

ALTER TABLE payments ADD COLUMN note TEXT;
