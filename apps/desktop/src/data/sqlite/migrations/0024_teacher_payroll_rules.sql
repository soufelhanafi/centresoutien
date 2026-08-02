-- 0024_teacher_payroll_rules.sql
-- What: teacher_payroll_rules table — how a teacher is paid monthly, either a flat
--       amount or a percentage of the fees attributable to them (CLAUDE.md §6,
--       SOU-70). Status is derived from the month range, never stored.
-- Why:  SOU-71. Gives the TeacherPayrollRule domain (SOU-70: close-and-reopen,
--       at-most-one-active-per-teacher, `CreateTeacherPayrollRule` /
--       `CloseTeacherPayrollRule`) its storage.
-- First ships in: v2.0.0.
--
-- Derived status: NO status column, mirroring student_subscriptions (0017) —
-- "live for month M" iff start_month <= M AND (end_month IS NULL OR M <= end_month).
-- Closing sets end_month; a rule change is a close plus a fresh row, never an
-- in-place edit of kind or amount (CLAUDE.md §6, §13).
--
-- Deliberately NO UNIQUE / partial-unique index enforcing at-most-one-active-per-
-- teacher: that invariant is enforced in the domain
-- (TooManyActivePayrollRulesError, via listLiveByTeacher + an overlap check) so
-- two concurrent creates on two laptops CONVERGE at sync-resolve instead of the DB
-- rejecting a push outright (same reasoning as student_subscriptions 0017 and
-- enrollments 0016). Not people-like: no natural_key, no matching-key index — a
-- rule is identified by its relationships (teacher + month range).
--
-- kind is a discriminator over the entity's two-member tagged union; amount_mad
-- and percent are both nullable and mutually exclusive by kind — amount_mad set
-- only for 'fixed-monthly', percent only for 'percentage-of-monthly-fees'. A
-- CHECK enforces exactly one of the two is populated (and in range) per kind,
-- mirroring the entity's exhaustive-switch guarantee at the DB level.
--
-- No FK on teacher_id (sync-order safe, per 0008/0015/0016/0017/0023): a payroll
-- rule can arrive before the teacher it points at during a pull, so the
-- relationship is enforced in the domain use case (CreateTeacherPayrollRule's
-- TeacherNotFoundError), not by the schema.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE teacher_payroll_rules;

CREATE TABLE teacher_payroll_rules (
  id            TEXT PRIMARY KEY,             -- ULID with 'pyr_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  teacher_id    TEXT NOT NULL,                -- ULID 'tch_' prefix (no FK, sync-order safe)
  kind          TEXT NOT NULL,                -- 'fixed-monthly' | 'percentage-of-monthly-fees'
  amount_mad    INTEGER,                      -- integer MAD centimes; set iff kind = 'fixed-monthly'
  percent       REAL,                         -- percentage points, e.g. 30 for 30%; set iff kind = 'percentage-of-monthly-fees'
  start_month   TEXT NOT NULL,                -- 'YYYY-MM' inclusive
  end_month     TEXT,                         -- 'YYYY-MM' inclusive, or NULL when open-ended (live)
  CHECK (id LIKE 'pyr\_%' ESCAPE '\'),
  CHECK (kind IN ('fixed-monthly', 'percentage-of-monthly-fees')),
  CHECK (
    (kind = 'fixed-monthly' AND amount_mad IS NOT NULL AND amount_mad > 0 AND percent IS NULL)
    OR
    (kind = 'percentage-of-monthly-fees' AND percent IS NOT NULL AND percent > 0 AND percent <= 100 AND amount_mad IS NULL)
  )
);

CREATE INDEX ix_teacher_payroll_rules_updated_at ON teacher_payroll_rules(updated_at);
CREATE INDEX ix_teacher_payroll_rules_center     ON teacher_payroll_rules(center_code, deleted_at);
CREATE INDEX ix_teacher_payroll_rules_teacher    ON teacher_payroll_rules(teacher_id, deleted_at);
