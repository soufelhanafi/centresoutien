-- 0031_recovery_codes.sql
-- What: hashed recovery codes for offline password reset (SOU-154).
-- Why:  16 single-use codes generated at account setup / on demand; the
--        plaintext is shown ONCE and never stored — only Argon2id hashes
--        live here. Code consumption is a soft boolean, not a delete, so
--        "a consumed code cannot be reused" is enforceable.
-- First ships in: v2.0.0.
--
-- LOCAL infra table — like admin_accounts and auth_lockout, no sync
-- envelope and never leaves the device. Recovery codes are device-local
-- credentials.

CREATE TABLE recovery_codes (
  id          TEXT PRIMARY KEY,       -- ULID with 'rec_' prefix
  code_hash   TEXT NOT NULL,          -- Argon2id PHC string
  consumed    INTEGER NOT NULL DEFAULT 0,  -- 0 = active, 1 = used
  created_at  TEXT NOT NULL,          -- ISO-8601 UTC
  consumed_at TEXT,                   -- ISO-8601 UTC; NULL until consumed
  CHECK (id LIKE 'rec\_%' ESCAPE '\')
);

CREATE INDEX ix_recovery_codes_consumed ON recovery_codes(consumed) WHERE consumed = 0;
