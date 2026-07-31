import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { StudentSubscription, StudentSubscriptionId } from '../entities/student-subscription';
import { closeStudentSubscriptionMonthSchema } from '../schemas/student-subscription';
import { StudentSubscriptionNotFoundError } from '../errors/subscription-errors';

export type CloseStudentSubscriptionInput = {
  centerCode: CenterCode;
  subscriptionId: StudentSubscriptionId;
  endMonth: string; // 'YYYY-MM', inclusive last active month
  updatedBy: UserId;
};

/**
 * Closes a live subscription by capping its `endMonth` — the only in-place change a
 * subscription ever takes (CLAUDE.md §7: never edited in place to change formula).
 * A formula change is this close plus a fresh `CreateStudentSubscription` starting a
 * later month; this use case owns only the close half.
 *
 * Gated by `core.formulas`. Validates the `endMonth` format with the shared schema,
 * then loads the subscription center-scoped: an unknown, already-tombstoned, or
 * foreign-center id raises {@link StudentSubscriptionNotFoundError} before anything
 * is touched — a stale or wrong-tenant id can never silently no-op as success
 * (mirrors `UnenrollStudent`). Setting `endMonth` earlier than `startMonth` is
 * permitted and simply yields a subscription that is active for zero months by the
 * derived-status rule (a full cancellation) — no separate error, no stored status.
 *
 * The write bumps `updatedAt` from the injected `Clock` (UTC) and stamps the actor's
 * `updatedBy`, so a same-field clash on `endMonth` can show *who* closed and when.
 * Identity fields are untouched; the row is never hard-deleted.
 */
export class CloseStudentSubscription {
  constructor(
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CloseStudentSubscriptionInput): Promise<StudentSubscription> {
    this.plan.require('core.formulas');
    const endMonth = closeStudentSubscriptionMonthSchema.parse(input.endMonth);

    const existing = await this.subscriptions.findById(input.subscriptionId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new StudentSubscriptionNotFoundError(input.subscriptionId);
    }

    const closed: StudentSubscription = {
      ...existing,
      endMonth,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    };
    await this.subscriptions.save(closed);
    return closed;
  }
}
