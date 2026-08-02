import { DomainError } from './plan-errors';
import type { TeacherPayrollRuleId } from '../entities/teacher-payroll-rule';
import type { TeacherId } from '../entities/teacher';
import type { StudentId } from '../entities/student';

/**
 * Thrown when a teacher would hold two overlapping active payroll rules — the
 * at-most-one-active-per-teacher invariant (CLAUDE.md §6). Unlike student
 * subscriptions, this is not split by kind: a teacher may not hold a live
 * `fixed-monthly` rule and a live `percentage-of-monthly-fees` rule at the same
 * time either. Two rules whose ranges do NOT overlap (a properly closed one
 * then a fresh one starting a later month — the close-and-reopen flow) are
 * allowed.
 *
 * Enforced in the domain use case, deliberately not as a DB UNIQUE constraint:
 * two laptops creating a rule before a sync must *converge* on resolve, not
 * fail the push (same reasoning as `TooManyActiveSubscriptionsError`). The
 * renderer resolves the stable `too-many-active-payroll-rules` code; the domain
 * stays i18n-agnostic.
 */
export class TooManyActivePayrollRulesError extends DomainError {
  readonly code = 'too-many-active-payroll-rules';

  constructor(readonly teacherId: TeacherId) {
    super(`Teacher "${teacherId}" already holds an active payroll rule overlapping the requested range.`);
  }
}

/**
 * Thrown when a close targets a payroll rule id with no live row in the current
 * center — unknown, already soft-deleted, or belonging to another center.
 * Mirrors `StudentSubscriptionNotFoundError` so the close never silently no-ops
 * on a stale or wrong-tenant id. The renderer resolves the stable
 * `teacher-payroll-rule-not-found` code; the domain stays i18n-agnostic.
 */
export class TeacherPayrollRuleNotFoundError extends DomainError {
  readonly code = 'teacher-payroll-rule-not-found';

  constructor(readonly id: TeacherPayrollRuleId) {
    super(`No live teacher payroll rule with id "${id}".`);
  }
}

/**
 * Thrown when a `TeacherFeeAttributionPolicy` input line names zero subjects —
 * equal-split attribution has no denominator to divide by. A Formula always
 * carries at least one subject (CLAUDE.md §7), so an empty line signals a
 * caller bug upstream (SOU-74's compute job), not a real business state.
 */
export class EmptyAttributionLineError extends DomainError {
  readonly code = 'empty-attribution-line';

  constructor(readonly studentId: StudentId) {
    super(`Attribution line for student "${studentId}" names zero subjects.`);
  }
}
