-- 0036_change_log.sql
-- What: change_log — the append-only causal record of every repository write
--       (SOU-79, Epic 9 sync foundation). One row per write, carrying a FULL
--       entity snapshot as `payload` JSON, so replaying the log in order rebuilds
--       the database state (replay = ordered upserts). It is also the feed the
--       sync engine will read to apply changes on other devices (SOU-80+).
-- Why:  SOU-79. Prerequisite for subject sync-apply (SOU-122) and all later sync
--       tickets. Machinery is built now and wired to a representative slice
--       (`subjects`); the remaining ~27 repos are retrofitted per-entity as each
--       sync ticket lands (KICKOFF decision 2) — the log has no consumer yet.
-- First ships in: v2.0.0.
--
-- Row shape (KICKOFF): the acting `device_id` is the CURRENT laptop (from
-- `resolveDeviceOrigin`), never the row's `device_origin` creator — a write is
-- attributed to the machine that made it. `revision` is a per-
-- (entity_type, entity_id) monotonic counter assigned MAX+1 by the writer;
-- `op` (create | update | delete) is derived from the write intent + revision.
-- `created_at` is ISO-8601 UTC from the Clock port; `center_code` scopes the row
-- to its tenant. `entity_type` doubles as the SQLite table name the writer
-- snapshots and replay upserts into.
--
-- Append-only, enforced TWO ways (mirrors payments 0019): (1) the ChangeLogWriter
-- port exposes only `record` — no update/delete method — and (2) the
-- BEFORE UPDATE / BEFORE DELETE triggers below RAISE(ABORT), so a stray query, a
-- future adapter bug, or a hand-edited DB can never mutate or prune the log. The
-- log is the source of truth for rebuild/sync; a deleted row is unrecoverable
-- history, so the DB layer forbids it outright (the ticket's "done when").
--
-- No id column: a change_log row is identified by its position, not a matching
-- key. Ordering for replay is the implicit rowid (insertion order == causal
-- order, single-threaded writes). The UNIQUE(entity_type, entity_id, revision)
-- index guarantees the monotonic counter never duplicates and backs the writer's
-- MAX(revision) lookup. No FKs (sync-order safe, per 0016/0018/0019): a logged
-- entity's own row lives in its own table under its own migration.
--
-- Additive-only. No backfill (new table). Logical undo is
-- DROP TRIGGER trg_change_log_no_delete; DROP TRIGGER trg_change_log_no_update; DROP TABLE change_log;

CREATE TABLE change_log (
  entity_type TEXT    NOT NULL,               -- names the entity; also the table replay upserts into
  entity_id   TEXT    NOT NULL,               -- the written row's ULID (opaque key)
  revision    INTEGER NOT NULL,               -- per-(entity_type, entity_id) monotonic counter, >= 1
  op          TEXT    NOT NULL,               -- 'create' | 'update' | 'delete'
  payload     TEXT    NOT NULL,               -- full entity snapshot as JSON (replay upserts this)
  device_id   TEXT    NOT NULL,               -- acting laptop (resolveDeviceOrigin), not row device_origin
  created_at  TEXT    NOT NULL,               -- ISO-8601 UTC (Clock port)
  center_code TEXT    NOT NULL,               -- tenant scope
  CHECK (op IN ('create', 'update', 'delete')),
  CHECK (revision >= 1)
);

-- Guarantees the monotonic revision never duplicates per entity, and backs the
-- writer's MAX(revision) lookup and any per-entity history read.
CREATE UNIQUE INDEX ux_change_log_entity_revision
  ON change_log(entity_type, entity_id, revision);

-- Backs tenant-scoped feed reads (everything the center has logged).
CREATE INDEX ix_change_log_center ON change_log(center_code, created_at);

-- Append-only safety net (KICKOFF). The writer port has no update/delete method,
-- but these triggers make the invariant structural: any UPDATE or DELETE on a
-- change_log row aborts. The log is write-once — corrections are new INSERTs
-- (a fresh revision), never edits.
CREATE TRIGGER trg_change_log_no_update
BEFORE UPDATE ON change_log
BEGIN
  SELECT RAISE(ABORT, 'change_log is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER trg_change_log_no_delete
BEFORE DELETE ON change_log
BEGIN
  SELECT RAISE(ABORT, 'change_log is append-only: DELETE is forbidden');
END;
