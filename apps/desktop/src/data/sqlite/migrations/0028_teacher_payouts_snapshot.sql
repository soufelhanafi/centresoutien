-- 0028_teacher_payouts_snapshot.sql
-- What: adds base_amount_mad + percent_snapshot to teacher_payouts (SOU-75).
-- Why:  the payslip PDF must always match what ComputeMonthlyPayrolls (SOU-74)
--       actually confirmed for a percentage-of-monthly-fees payout, never a live
--       re-attribution that could drift from a later-edited invoice. Both are
--       populated by ComputeMonthlyPayrolls going forward; nullable because a
--       deterministic backfill is impossible (the attribution base a past run
--       computed cannot be recomputed byte-identically from today's data —
--       invoices may have changed since), per migration-authoring's backfill
--       rule. Existing rows keep NULL and simply have no snapshot to print.
-- First ships in: v2.1.0.
--
-- Both columns are NULL for 'fixed-monthly' payouts by design (no attribution
-- base or percent applies) and for any payout computed before this migration.
--
-- Additive-only. No backfill. Logical undo: none (dropping a live column is
-- forbidden; a later major version may retire these if ever unused).

ALTER TABLE teacher_payouts ADD COLUMN base_amount_mad INTEGER;
ALTER TABLE teacher_payouts ADD COLUMN percent_snapshot REAL; -- percentage points, e.g. 30 for 30% (mirrors teacher_payroll_rules.percent)
