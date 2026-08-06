-- 0001_hub_canonical_store.sql
-- What: the embedded hub's canonical store (SOU-90, Epic 9). One SQLCipher
--       file per center (`hub-<centreId>.db`), holding the hub's FOUR and only
--       jobs (CLAUDE.md §5bis): canonical entity rows with `version` counters
--       (hub_entity), an append-only change feed (hub_feed), one cursor per
--       (device_id, centre_id) (hub_cursor), and the per-center pairing token
--       (hub_center). The hub is a dumb versioned mailbox: this schema is pure
--       storage. No merge rule, no conflict logic, no business predicate — any
--       of those landing here is an architecture violation.
-- Why:  SOU-90. The LAN hub needs its own durable canonical store so a hub
--       restart never loses feed history or device cursors. It mirrors the
--       device-side SyncHubPort semantics already proven by the in-memory fake
--       (SOU-80): base-version check across the WHOLE push batch, atomic;
--       version = current canonical + 1 per accepted write; pull = everything
--       with seq > cursor; cursor keyed per (device_id, centre_id).
-- First ships in: v2.0.0.
--
-- Storage notes:
--  * hub_entity.entity_json is the full DOMAIN-shape snapshot (the versioned
--    change_log payload shape), with the hub-assigned `version` stamped in —
--    identical to what every device applies on pull, so all replicas converge
--    on byte-identical snapshots.
--  * hub_feed.seq is the implicit rowid (INTEGER PRIMARY KEY) — insertion
--    order == causal order, exactly like change_log. No AUTOINCREMENT keyword:
--    the feed is append-only (triggers below), so rowids never need reuse.
--    Cursors and delta feeds are sliced on seq.
--  * hub_feed.op carries a CHECK like change_log's; UPDATE/DELETE triggers make
--    the append-only invariant structural — a pruned feed would silently
--    re-deliver "new" history to devices or strand their cursors.
--  * centre_id scopes every row even though the file is per-center: defense in
--    depth and the seam a future consolidated hub file would need.
--  * No FKs to business tables (sync-order safe, per 0016/0018/0019): the hub
--    stores opaque entity snapshots, not row relations.
--
-- Rollback: IRREVERSIBLE once a center has synced — dropping these tables
-- destroys the canonical version history devices converge on. A pre-sync hub
-- file can simply be deleted (the hub re-creates it on next start).

CREATE TABLE hub_center (
  centre_id     TEXT PRIMARY KEY,             -- tenant scope (per-center file today)
  pairing_token TEXT NOT NULL,                -- LAN pairing secret, never a password
  created_at    TEXT NOT NULL                 -- ISO-8601 UTC
);

CREATE TABLE hub_entity (
  centre_id   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  version     INTEGER NOT NULL,               -- canonical version (accepted-push counter)
  entity_json TEXT NOT NULL,                  -- stamped domain snapshot, as JSON
  updated_at  TEXT NOT NULL,                  -- ISO-8601 UTC (hub receive time)
  PRIMARY KEY (centre_id, entity_type, entity_id)
);

CREATE TABLE hub_feed (
  seq            INTEGER PRIMARY KEY,         -- implicit rowid: feed position, cursor slice key
  centre_id      TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  version        INTEGER NOT NULL CHECK (version >= 1),
  op             TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')),
  entity_json    TEXT NOT NULL,
  changed_fields TEXT NOT NULL,               -- JSON array of the write's changed domain fields
  device_id      TEXT NOT NULL,
  updated_by     TEXT NOT NULL,
  device_seq     INTEGER NOT NULL,            -- originating device's monotonic sequence
  received_at    TEXT NOT NULL                -- ISO-8601 UTC (hub receive time)
);

CREATE INDEX idx_hub_feed_centre_seq ON hub_feed (centre_id, seq);

CREATE TABLE hub_cursor (
  device_id TEXT NOT NULL,
  centre_id TEXT NOT NULL,
  seq       INTEGER NOT NULL,
  PRIMARY KEY (device_id, centre_id)
);

-- Append-only safety net, mirroring change_log 0036. The hub store has no
-- update/delete method on the feed, but these triggers make it structural: any
-- UPDATE or DELETE on a hub_feed row aborts. The feed is write-once.
CREATE TRIGGER trg_hub_feed_no_update
BEFORE UPDATE ON hub_feed
BEGIN
  SELECT RAISE(ABORT, 'hub_feed is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER trg_hub_feed_no_delete
BEFORE DELETE ON hub_feed
BEGIN
  SELECT RAISE(ABORT, 'hub_feed is append-only: DELETE is forbidden');
END;
