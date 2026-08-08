-- 0038_sync_outbox.sql
-- What: the device-side sync OUTBOX watermark — one row per center recording the
--       highest `change_log.rowid` this device has already turned into a pushable
--       pending write (SOU-180). The outbox drains every undrained local write
--       from the append-only `change_log` (0036) into the sync engine's pending
--       queue (`sync_local_entity.pending_json`, 0037) so `SyncEngine.run()` can
--       push it — the missing bridge between a repository write and a real sync.
-- Why:  SOU-180. The engine (SOU-80/81) reads `LocalSyncRepository.listPending()`,
--       but nothing populated it from local user edits — only inbound merge and the
--       e2e conflict seed called `upsertPending`. Without this, `sync.run` pushes 0
--       and a real edit on one laptop never reaches another (the SOU-82 gap).
-- First ships in: v2.0.0.
--
-- One row per center (one encrypted DB file per center, so effectively one row):
-- `last_rowid` is the drain cursor over `change_log.rowid` (insertion order ==
-- causal order, single-threaded writes). A drain reads rows with rowid > last_rowid,
-- enqueues them as pending, and advances last_rowid in the SAME transaction, so an
-- already-pushed write is never re-enqueued. Advancing is an UPDATE of the scalar,
-- never a DELETE — the sync-safe no-hard-delete rule holds even for this bookkeeping.
--
-- Additive-only. No backfill (new table). Logical undo: DROP TABLE sync_outbox.

CREATE TABLE sync_outbox (
  center_code TEXT    NOT NULL PRIMARY KEY,  -- tenant scope (one center per DB file)
  last_rowid  INTEGER NOT NULL DEFAULT 0     -- highest change_log.rowid drained into pending
);
