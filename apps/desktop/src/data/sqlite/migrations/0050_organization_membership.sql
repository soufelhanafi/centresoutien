-- 0050_organization_membership.sql
-- What: `organization` + `membership` — the multi-center authorization/packaging
--       layer (SOU-95), persisted on desktop so the add-a-center flow (SOU-310)
--       can seed the owning org + the director's owner membership into each new
--       per-center DB.
-- Why:  SOU-310 makes Premium's multi-center entitlement usable by creating
--       additional centers from inside the app. Each new center DB records who
--       owns it (Membership) and its billing-contact org (Organization), the
--       desktop foothold of the SOU-95 domain whose persistence was previously
--       deferred to the cloud tier.
-- Rollback: additive-only. Logical undo is DROP TABLE membership; DROP TABLE
--       organization; never applied to a released DB in place.
-- First ships in: v2.x (SOU-310).
--
-- Both are SYNCED entities: full envelope so the rows converge across a center's
-- laptops. Soft-delete only — a revoked membership or retired org is a tombstone,
-- never a DELETE. Neither is people-like (matched-in across devices), so there is
-- no natural_key: an org/membership is created deliberately, not deduped.
--
-- Tenancy (CLAUDE.md §5ter): the Center stays the tenant. `membership.centre_id`
-- is the center this membership grants access to; in the one-DB-per-center model
-- it mirrors `center_code`, kept explicit so authorization compares the SELECTED
-- center against it directly. Every row here belongs to this file's one center.
--
-- Additive and sync-neutral for existing centers: both tables start empty on
-- replay (first-run centers seed no ownership — the owner is minted after the
-- center row, so no membership is written there), so no existing row is touched
-- and no updated_at/version is bumped anywhere.

CREATE TABLE organization (
  id              TEXT    PRIMARY KEY,            -- ULID with 'org_' prefix
  center_code     TEXT    NOT NULL,               -- tenant scope
  device_origin   TEXT    NOT NULL,               -- machine that first created the row
  created_at      TEXT    NOT NULL,               -- ISO-8601 UTC (Clock port)
  updated_at      TEXT    NOT NULL,
  updated_by      TEXT    NOT NULL,               -- user ULID of last editor
  deleted_at      TEXT,                           -- NULL when alive; soft delete only
  version         INTEGER NOT NULL DEFAULT 0,     -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  name            TEXT    NOT NULL,               -- org display name
  billing_contact TEXT    NOT NULL,               -- who receives the consolidated invoice
  CHECK (id LIKE 'org\_%' ESCAPE '\')
);

CREATE INDEX ix_organization_updated_at ON organization(updated_at);
CREATE INDEX ix_organization_center     ON organization(center_code, deleted_at);

CREATE TABLE membership (
  id            TEXT    PRIMARY KEY,              -- ULID with 'mbr_' prefix
  center_code   TEXT    NOT NULL,                 -- tenant scope
  device_origin TEXT    NOT NULL,                 -- machine that first created the row
  created_at    TEXT    NOT NULL,                 -- ISO-8601 UTC (Clock port)
  updated_at    TEXT    NOT NULL,
  updated_by    TEXT    NOT NULL,                 -- user ULID of last editor
  deleted_at    TEXT,                             -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,       -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  user_id       TEXT    NOT NULL,                 -- the user this membership binds
  centre_id     TEXT    NOT NULL,                 -- center it grants access to (mirrors center_code)
  role          TEXT    NOT NULL,                 -- owner | admin | secretary | viewer
  CHECK (id LIKE 'mbr\_%' ESCAPE '\'),
  CHECK (role IN ('owner', 'admin', 'secretary', 'viewer'))
);

CREATE INDEX ix_membership_updated_at ON membership(updated_at);
CREATE INDEX ix_membership_center     ON membership(center_code, deleted_at);

-- One live membership per (user, center): a user is granted a center once. A
-- revoked (tombstoned) membership frees the pair so it can be re-granted, exactly
-- like the users/subjects live-uniqueness indexes.
CREATE UNIQUE INDEX ux_membership_user_centre_live
  ON membership(center_code, user_id, centre_id)
  WHERE deleted_at IS NULL;
