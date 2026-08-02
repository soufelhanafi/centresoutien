-- 0026_teacher_payouts.sql
-- What: teacher_payouts table — a teacher's proposed monthly pay (CLAUDE.md §6,
--       SOU-74). Always proposed by ComputeMonthlyPayrolls, never auto-paid;
--       confirming a draft to paid is SOU-76.
-- Why:  SOU-74. Gives the TeacherPayout domain (entity + ComputeMonthlyPayrolls
--       compute job) its storage, mirroring the 0024_teacher_payroll_rules split
--       (domain first, adapter + migration in the same ticket here).
-- First ships in: v2.0.0.
--
-- Status model: 'draft' | 'paid' (CLAUDE.md §6/§13). This migration's job only
-- ever writes 'draft'; the 'paid' transition and reversal entries are SOU-76.
-- Once 'paid', a row is immutable except notes — enforced in the domain, not
-- here (no DB trigger blocking a column update, mirroring how Formula
-- immutability-after-use is a domain policy check, not a schema constraint,
-- except where a trigger already exists elsewhere for that one case).
--
-- rule_kind snapshots which TeacherPayrollRule kind produced amount_mad, so a
-- later rule change never re-derives an already-computed month's history.
--
-- ⚠️ NO UNIQUE(teacher_id, month): the (teacherId, month) idempotency key is
-- enforced in the domain (ComputeMonthlyPayrolls + findLiveByTeacherMonth), not
-- a DB constraint — two laptops computing the same month before a sync must
-- converge on sync-resolve rather than reject the push (same rationale as
-- 0016/0017/0018's missing uniques).
--
-- No FK on teacher_id (sync-order safe, per 0008/0015/0016/0017/0023/0024): a
-- payout can arrive before the teacher it points at during a pull.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE teacher_payouts;

CREATE TABLE teacher_payouts (
  id            TEXT PRIMARY KEY,             -- ULID with 'pyo_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  teacher_id    TEXT NOT NULL,                -- ULID 'tch_' prefix (no FK, sync-order safe)
  month         TEXT NOT NULL,                -- 'YYYY-MM'
  rule_kind     TEXT NOT NULL,                -- 'fixed-monthly' | 'percentage-of-monthly-fees'
  amount_mad    INTEGER NOT NULL,             -- integer MAD centimes, computed monthly pay
  status        TEXT NOT NULL DEFAULT 'draft',-- 'draft' | 'paid'
  notes         TEXT,                         -- the sole field a 'paid' payout may still change
  CHECK (id LIKE 'pyo\_%' ESCAPE '\'),
  CHECK (rule_kind IN ('fixed-monthly', 'percentage-of-monthly-fees')),
  CHECK (status IN ('draft', 'paid')),
  CHECK (amount_mad >= 0)
);

CREATE INDEX ix_teacher_payouts_updated_at     ON teacher_payouts(updated_at);
CREATE INDEX ix_teacher_payouts_center_month   ON teacher_payouts(center_code, month, deleted_at);
CREATE INDEX ix_teacher_payouts_teacher_month  ON teacher_payouts(teacher_id, month, deleted_at);
