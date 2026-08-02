import type { TeacherAttributionBreakdownEntryView, TeacherPayoutView } from './teacher-payout-view';

/**
 * In-memory stand-in for the not-yet-published payroll dashboard channels (see
 * `payroll-gateway.ts`). Covers both rule kinds, a draft and an already-paid
 * row, and two months so the month picker has something to switch between.
 * `teacherId` values are arbitrary — they resolve against real teacher data at
 * runtime and fall back to "unknown teacher" when they don't match, exactly
 * like `INVOICE_SEED`'s `studentId`s.
 */
export const TEACHER_PAYOUT_SEED: readonly TeacherPayoutView[] = [
  {
    id: 'pyo_01HW0SEED00000000000000001',
    teacherId: 'tch_01HW0SEED0000000000000001',
    month: '2026-07',
    ruleKind: 'fixed-monthly',
    amountMad: 300000,
    baseAmountMad: null,
    percentSnapshot: null,
    status: 'draft',
    notes: null,
  },
  {
    id: 'pyo_01HW0SEED00000000000000002',
    teacherId: 'tch_01HW0SEED0000000000000002',
    month: '2026-07',
    ruleKind: 'percentage-of-monthly-fees',
    amountMad: 87500,
    baseAmountMad: 350000,
    percentSnapshot: 25,
    status: 'draft',
    notes: null,
  },
  {
    id: 'pyo_01HW0SEED00000000000000003',
    teacherId: 'tch_01HW0SEED0000000000000003',
    month: '2026-07',
    ruleKind: 'percentage-of-monthly-fees',
    amountMad: 60000,
    baseAmountMad: 200000,
    percentSnapshot: 30,
    status: 'paid',
    notes: null,
  },
  {
    id: 'pyo_01HW0SEED00000000000000004',
    teacherId: 'tch_01HW0SEED0000000000000001',
    month: '2026-06',
    ruleKind: 'fixed-monthly',
    amountMad: 300000,
    baseAmountMad: null,
    percentSnapshot: null,
    status: 'paid',
    notes: null,
  },
];

export const ATTRIBUTION_BREAKDOWN_SEED: readonly TeacherAttributionBreakdownEntryView[] = [
  { teacherId: 'tch_01HW0SEED0000000000000002', subjectId: 'sub_01HW0SEED0000000000000001', amountMad: 52500 },
  { teacherId: 'tch_01HW0SEED0000000000000002', subjectId: 'sub_01HW0SEED0000000000000002', amountMad: 35000 },
  { teacherId: 'tch_01HW0SEED0000000000000003', subjectId: 'sub_01HW0SEED0000000000000001', amountMad: 40000 },
  { teacherId: 'tch_01HW0SEED0000000000000003', subjectId: 'sub_01HW0SEED0000000000000003', amountMad: 20000 },
  // A stale row for a teacher with no live payout at all — exercises the
  // gateway's month-scoping of the breakdown (a teacher whose payroll rule
  // was closed before this month should never surface a drill-down row).
  { teacherId: 'tch_01HW0SEED0000000000000099', subjectId: 'sub_01HW0SEED0000000000000001', amountMad: 10000 },
];
