-- 0044_users.sql
-- What: `users` — the multi-user, sync-safe credential + identity store (SOU-252),
--       plus a one-time backfill that migrates the existing single AdminAccount
--       into it as the center's `owner`.
-- Why:  SOU-252 converts single-admin auth into a per-user model: one users
--       table, one login path, one throttle. The director is `owner`; employees
--       are invited (secretary) and redeem a one-time setup code to set their own
--       password. Login now resolves a `users` row by username.
-- Rollback: additive-only. Logical undo is DROP TABLE users; never applied to a
--       released DB in place.
-- First ships in: v2.x (SOU-252).
--
-- SYNCED entity (unlike the device-local admin_accounts/auth tables): carries the
-- full envelope so accounts converge across the center's laptops. Soft-delete
-- only (a removed employee is a tombstone). `password_hash` and `setup_code_hash`
-- are opaque Argon2id PHC strings from the main-process hasher — never plaintext.
-- `username_normalized` (NFC+trim+lower, the domain `normalizeUsername`, SOU-153)
-- is what login queries by; `username` keeps the display form as typed.
--
-- Uniqueness is EXACT, not fuzzy: a partial UNIQUE index on
-- (center_code, username_normalized) among LIVE rows — like subjects.code — so an
-- archived username frees up. Users are created deliberately by the director, not
-- matched-in from two devices, so there is no people-like natural_key to dedupe.

CREATE TABLE users (
  id                     TEXT    PRIMARY KEY,            -- ULID with 'usr_' prefix
  center_code            TEXT    NOT NULL,               -- tenant scope
  device_origin          TEXT    NOT NULL,               -- machine that first created the row
  created_at             TEXT    NOT NULL,               -- ISO-8601 UTC (Clock port)
  updated_at             TEXT    NOT NULL,
  updated_by             TEXT    NOT NULL,               -- user ULID of last editor
  deleted_at             TEXT,                           -- NULL when alive; soft delete only
  version                INTEGER NOT NULL DEFAULT 0,     -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  role                   TEXT    NOT NULL,               -- owner | admin | secretary | viewer
  username               TEXT    NOT NULL,               -- display form, as typed
  username_normalized    TEXT    NOT NULL,               -- NFC+trim+lower; login matches on this
  password_hash          TEXT,                           -- Argon2id; NULL until an invite is redeemed
  setup_code_hash        TEXT,                           -- Argon2id of the pending one-time code; NULL once redeemed/owner
  setup_code_expires_at  INTEGER,                        -- epoch millis UTC (Clock port); NULL when no code is pending
  setup_code_redeemed_at TEXT,                           -- ISO-8601 UTC; NULL while pending; single-use marker
  CHECK (id LIKE 'usr\_%' ESCAPE '\'),
  CHECK (role IN ('owner', 'admin', 'secretary', 'viewer'))
);

-- Per-center exact username uniqueness among LIVE rows (mirrors subjects.code):
-- a tombstoned username frees up, and two centers never collide.
CREATE UNIQUE INDEX ux_users_username_live
  ON users(center_code, username_normalized)
  WHERE deleted_at IS NULL;

-- Sync feed (listChangedSince) and tenant-scoped reads.
CREATE INDEX ix_users_updated_at ON users(updated_at);
CREATE INDEX ix_users_center     ON users(center_code, deleted_at);

-- One-time backfill: migrate the existing single AdminAccount into users as the
-- owner. Idempotent (guarded by NOT EXISTS an owner) so replay from any prior
-- version — and a re-run — never duplicates or overwrites.
--
-- The admin ULID is preserved, only its prefix swapped (adm_<ULID> -> usr_<ULID>),
-- so the id stays stable and valid. center_code/device_origin come from the
-- center's own synced row (the `center` singleton, migration 0006): whenever an
-- admin_accounts row exists the first-run wizard has already written that row, so
-- the join resolves — and it yields the SAME center_code/device_origin every
-- other entity in this file carries. The owner is its own last editor (updatedBy
-- = its id), the one self-referential write in the system, and starts at version
-- 0 (a fresh sync entity; the hub assigns on first push).
--
-- Deliberately NO change_log row here: admin credentials were never synced, so an
-- upgraded center keeps its owner device-local exactly as before — the director
-- can log in immediately after upgrade with no lockout. Cross-device owner
-- replication is a later sync slice, not this migration's job.
INSERT INTO users (
  id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
  version, role, username, username_normalized, password_hash,
  setup_code_hash, setup_code_expires_at, setup_code_redeemed_at
)
SELECT
  'usr_' || substr(a.id, 5),
  c.center_code,
  c.device_origin,
  a.created_at,
  a.updated_at,
  'usr_' || substr(a.id, 5),
  NULL,
  0,
  'owner',
  a.username,
  COALESCE(a.username_normalized, normalize_username(a.username)),
  a.password_hash,
  NULL, NULL, NULL
FROM admin_accounts a
CROSS JOIN center c
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.role = 'owner' AND u.deleted_at IS NULL);
