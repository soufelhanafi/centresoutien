-- 0009_rooms.sql
-- What: rooms table — physical rooms the center schedules sessions into.
-- Why:  SOU-33. The Room domain (entity + Create/Archive use cases) landed in
--       SOU-32; this migration + its SQLite adapter give it persistence.
-- First ships in: v2.0.0.
--
-- Not people-like: a room is identified by its relationships, not by a matching
-- key, so it carries NO natural_key and no unique index. Soft-delete only —
-- archiving sets deleted_at; a tombstoned row still syncs. Envelope columns
-- follow the standard template (order preserved).
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE rooms;

CREATE TABLE rooms (
  id            TEXT PRIMARY KEY,             -- ULID with 'rom_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  name          TEXT NOT NULL,                -- plain label, e.g. "Salle A" (not translated)
  capacity      INTEGER NOT NULL,             -- seats
  active        INTEGER NOT NULL DEFAULT 1,   -- boolean 0/1
  CHECK (id LIKE 'rom\_%' ESCAPE '\'),
  CHECK (capacity >= 1),
  CHECK (active IN (0, 1))
);

CREATE INDEX ix_rooms_updated_at ON rooms(updated_at);
CREATE INDEX ix_rooms_center     ON rooms(center_code, deleted_at);
