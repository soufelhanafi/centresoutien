-- 0032_auth_audit_log.sql
-- What: append-only security event log (SOU-154, CNDP/Loi 09-08).
-- Why:  every recovery-code generation, consumption, and password reset
--        must be recorded with timestamp + account. Immutable (no UPDATE
--        after INSERT) — events are facts, not state.
-- First ships in: v2.0.0.
--
-- LOCAL infra table — like admin_accounts and auth_lockout, no sync
-- envelope and never leaves the device.

CREATE TABLE auth_audit_log (
  id          TEXT PRIMARY KEY,       -- ULID with 'aaev_' prefix
  event_type  TEXT NOT NULL,          -- 'recovery-codes-generated' | 'recovery-codes-regenerated' | 'recovery-code-consumed' | 'password-reset-via-recovery-code'
  username    TEXT NOT NULL,
  created_at  TEXT NOT NULL,          -- ISO-8601 UTC
  metadata    TEXT NOT NULL DEFAULT '{}',  -- JSON object
  CHECK (id LIKE 'aaev\_%' ESCAPE '\')
);

CREATE INDEX ix_auth_audit_log_username ON auth_audit_log(username);
CREATE INDEX ix_auth_audit_log_event_type ON auth_audit_log(event_type);
