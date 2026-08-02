import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { TeacherId } from './teacher';
import type { TeacherPayrollRuleKind } from './teacher-payroll-rule';

/**
 * ULID id prefix for teacher payouts: `pyo_01HW…`. Not `pay_` — that prefix is
 * already `Payment`'s (the append-only money ledger); `pyo` keeps the two
 * entities unambiguous by id alone, alongside `pyr_` (`TeacherPayrollRule`).
 */
export const TEACHER_PAYOUT_ID_PREFIX = 'pyo';

export type TeacherPayoutId = Brand<string, 'TeacherPayoutId'>;

/**
 * The stored lifecycle of a `TeacherPayout` (CLAUDE.md §6). `ComputeMonthlyPayrolls`
 * (SOU-74) only ever writes `draft`; confirming a draft to `paid` is SOU-76's
 * "Generate payslips" / "Mark all paid" bulk actions, not this entity's job.
 */
export const TEACHER_PAYOUT_STATUSES = ['draft', 'paid'] as const;
export type TeacherPayoutStatus = (typeof TEACHER_PAYOUT_STATUSES)[number];

/**
 * A teacher's proposed monthly pay (CLAUDE.md §6) — the domain proposes it, a
 * human confirms it. Named `TeacherPayout`, not `Payslip`: "Payslip" is reserved
 * for the PDF *document* SOU-75 renders from a confirmed payout; there is no
 * separate Payslip entity.
 *
 * Identified by the `(teacherId, month)` relationship, not a matching key — not
 * people-like, so it carries no `naturalKey`. `ruleKind` snapshots which
 * `TeacherPayrollRule` kind produced `amountMad`, so a later rule change never
 * re-derives history for an already-computed month.
 *
 * **Immutable once `paid`**, except `notes` (CLAUDE.md §6/§13) — reversing a paid
 * payout creates a fresh payout entry, never an edit of this row; that reversal
 * flow is SOU-76's, not built here. Soft-delete only, mirroring every entity's
 * envelope, though no use case exposes discarding a payout yet.
 */
export type TeacherPayout = EntityEnvelope & {
  readonly id: TeacherPayoutId;
  readonly teacherId: TeacherId;
  readonly month: string; // 'YYYY-MM'
  ruleKind: TeacherPayrollRuleKind;
  amountMad: number; // integer MAD centimes
  status: TeacherPayoutStatus;
  notes: string | null;
};
