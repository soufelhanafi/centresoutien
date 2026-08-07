-- 0037_sync_local.sql
-- What: device-side sync state — the durable "conflits en attente" store and the
--       local replica's knowledge of canonical versions. SOU-91 (conflict popup +
--       inbox UI) needs blocked conflicts to survive restart: `blockPending` now
--       stores the `SyncConflict` object, and `ResolveConflict` re-surfaces it via
--       `listBlocked`. Also stores the per-center sync cursor so a device's pull
--       position persists across app restarts.
-- Why:  SOU-91. `change_log` is append-only (0036 triggers forbid UPDATE/DELETE),
--       so a blocked flag cannot live there; this is the device-side complement to
--       the hub's canonical store (hub_entity / hub_cursor, SOU-90).
-- First ships in: v2.0.0.
--
-- One table holds an entity's canonical state + its (optional) unsynced pending
-- write + the (optional) blocked conflict, mirroring the in-memory
-- `LocalSyncRepository`'s StoredState. Clearing a pending/blocked write is an
-- UPDATE (NULL out the columns), never a DELETE — the sync-safe no-hard-delete
-- rule holds even for this device-local bookkeeping. These rows carry no entity
-- envelope (`id`/`created_at`/`device_origin`/`updated_by`/`version` counter)
-- because they are LOCAL device state, never exchanged with the hub; `entity_json`
-- is the DOMAIN-shape snapshot (the same shape `change_log.payload.entity`
-- carries), stored opaque so the adapter never guesses a physical row.
--
-- Additive-only. No backfill (new tables). Logical undo:
--   DROP TABLE sync_cursor; DROP TABLE sync_local_entity;

CREATE TABLE sync_local_entity (
  entity_type     TEXT NOT NULL,               -- names the entity (matches change_log.entity_type)
  entity_id       TEXT NOT NULL,               -- the entity's ULID
  version         INTEGER NOT NULL,            -- last canonical version this device knows
  entity_json     TEXT NOT NULL,               -- domain-shape canonical snapshot
  pending_json    TEXT,                        -- unsynced local write snapshot (null when synced/clear)
  seq             INTEGER NOT NULL DEFAULT 0,  -- per-device monotonic write sequence (of pending_json)
  blocked         INTEGER NOT NULL DEFAULT 0,  -- 1 = the pending write is frozen behind a conflict
  conflict_json   TEXT,                        -- the stored SyncConflict when blocked (inbox)
  center_code     TEXT NOT NULL,               -- tenant scope
  PRIMARY KEY (entity_type, entity_id),
  CHECK (blocked IN (0, 1))
);

CREATE INDEX ix_sync_local_entity_center ON sync_local_entity(center_code);

-- The sync cursor: one row per (device_id, center_code). The device's local
-- cursor is the source of truth for pulls; this persists it across restarts.
CREATE TABLE sync_cursor (
  device_id   TEXT NOT NULL,
  center_code TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  PRIMARY KEY (device_id, center_code)
);
