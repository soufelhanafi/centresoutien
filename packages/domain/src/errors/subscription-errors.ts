import { DomainError } from './plan-errors';
import type { StudentSubscriptionId } from '../entities/student-subscription';
import type { StudentId } from '../entities/student';
import type { GroupKind } from '../entities/group';

/**
 * Thrown when a student would hold two overlapping active subscriptions of the same
 * `kind` — the at-most-one-active-per-(student, kind) invariant (CLAUDE.md §7). A
 * student may hold one active `regular` and one active `exam-prep` subscription at a
 * time, but never two of the same track whose `[startMonth, endMonth|∞]` ranges
 * overlap. Two same-kind subscriptions that do NOT overlap (a properly closed one
 * then a fresh one starting a later month — the close-and-reopen flow) are allowed.
 *
 * Enforced in the domain use case, deliberately not as a DB UNIQUE constraint: two
 * laptops creating a subscription before a sync must *converge* on resolve, not fail
 * the push (same reasoning as the enrollment duplicate guard, SOU-123). The renderer
 * resolves the stable `too-many-active-subscriptions` code; the domain stays
 * i18n-agnostic.
 */
export class TooManyActiveSubscriptionsError extends DomainError {
  readonly code = 'too-many-active-subscriptions';

  constructor(
    readonly studentId: StudentId,
    readonly kind: GroupKind,
  ) {
    super(
      `Student "${studentId}" already holds an active "${kind}" subscription overlapping the requested range.`,
    );
  }
}

/**
 * Thrown when a close targets a subscription id with no live row in the current
 * center — unknown, already soft-deleted, or belonging to another center. Mirrors
 * `EnrollmentNotFoundError` / `SubjectNotFoundError` so the close never silently
 * no-ops on a stale or wrong-tenant id. The renderer resolves the stable
 * `student-subscription-not-found` code; the domain stays i18n-agnostic.
 */
export class StudentSubscriptionNotFoundError extends DomainError {
  readonly code = 'student-subscription-not-found';

  constructor(readonly id: StudentSubscriptionId) {
    super(`No live student subscription with id "${id}".`);
  }
}
