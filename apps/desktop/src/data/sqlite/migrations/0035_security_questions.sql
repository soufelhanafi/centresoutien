-- 0035_security_questions.sql
-- What: security-questions fallback reset path (SOU-155) — the three Q&A set
--       at account setup, stored as Argon2id answer hashes, plus a dedicated
--       lockout counter for the reset path's own 3-attempt throttle.
-- Why:  tertiary reset path for when a user has no recovery code and no
--       internet access. Answers are hashed only; plaintext is never stored.
--       `security_question_lockout` is intentionally separate from SOU-27's
--       `auth_lockout` (6-attempt login/recovery-code counter): this path's
--       acceptance criteria require a tighter 3-attempt threshold, and
--       sharing one counter across two gates with different thresholds would
--       make each one's remaining-attempts count wrong for the other.
-- Rollback: additive-only. Logical undo is DROP TABLE (disposable device-local
--       state); never applied to a released DB in place.
-- First ships in: v2.x (SOU-155).
--
-- LOCAL infra tables — like admin_accounts, recovery_codes, and auth_lockout,
-- no sync envelope (no center_code / device_origin / version) and never leave
-- the device: auth is device-local, not synced. `deleted_at` is still present
-- because CLAUDE.md §13 forbids hard deletes everywhere, sync or not — re-setup
-- soft-deletes the previous set and inserts a fresh one instead of DELETE FROM.

CREATE TABLE security_questions (
  id            TEXT PRIMARY KEY,       -- ULID with 'secq_' prefix
  question_key  TEXT NOT NULL,
  answer_hash   TEXT NOT NULL,          -- Argon2id PHC string
  created_at    TEXT NOT NULL,          -- ISO-8601 UTC
  updated_at    TEXT NOT NULL,          -- ISO-8601 UTC
  deleted_at    TEXT,                   -- ISO-8601 UTC; NULL = active (soft delete only)
  CHECK (id LIKE 'secq\_%' ESCAPE '\')
);

CREATE UNIQUE INDEX ux_security_questions_question_key
  ON security_questions(question_key)
  WHERE deleted_at IS NULL;

CREATE TABLE security_question_lockout (
  id              INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton
  failed_attempts INTEGER NOT NULL DEFAULT 0,          -- consecutive failures
  locked_until    INTEGER                              -- epoch millis UTC; NULL = not locked
);

INSERT INTO security_question_lockout (id) VALUES (1);
