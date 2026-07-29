-- 0004_auth_lockout_session.sql
-- What: login throttle state + remembered device session, one row each.
-- Why:  SOU-27 layers a 5-attempt / 15-minute lockout and a "remember this
--       device" session on top of the SOU-26 admin account.
-- First ships in: v2.0.0.
--
-- LOCAL infra tables — like admin_accounts, app_meta, and _schema_migrations they
-- carry NO sync envelope (no center_code / device_origin / version / deleted_at)
-- and never leave the device: auth is device-local, not synced. Each is a
-- singleton (CHECK id = 1) seeded here, so the adapters only ever UPDATE row 1 —
-- "no active session" is a NULL session_id, never a deleted row (no DELETE path).

CREATE TABLE auth_lockout (
  id              INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton
  failed_attempts INTEGER NOT NULL DEFAULT 0,          -- consecutive failures
  locked_until    TEXT                                 -- ISO-8601 UTC; NULL = not locked
);

INSERT INTO auth_lockout (id) VALUES (1);

CREATE TABLE device_sessions (
  id          INTEGER PRIMARY KEY CHECK (id = 1),      -- singleton (one active session)
  session_id  TEXT,                                    -- ULID 'ses_' prefix; NULL = not remembered
  created_at  TEXT,                                    -- ISO-8601 UTC (Clock port)
  expires_at  TEXT,                                    -- ISO-8601 UTC; expiry decided in the domain
  CHECK (session_id IS NULL OR session_id LIKE 'ses\_%' ESCAPE '\')
);

INSERT INTO device_sessions (id) VALUES (1);
