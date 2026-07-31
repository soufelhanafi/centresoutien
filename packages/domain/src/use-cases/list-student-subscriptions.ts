import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { StudentSubscription } from '../entities/student-subscription';
import type { StudentId } from '../entities/student';

export type ListStudentSubscriptionsInput = {
  centerCode: CenterCode;
  studentId: StudentId;
};

/**
 * Lists a student's **live** subscriptions (both tracks), newest start first — the
 * student detail sheet's subscription history. Gated by `core.formulas`. The rows
 * are center-scoped by construction (one DB per center); a defensive `centerCode`
 * filter keeps a foreign row from leaking should a shared connection ever exist.
 * Tombstones are excluded by the repository read.
 */
export class ListStudentSubscriptions {
  constructor(
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListStudentSubscriptionsInput): Promise<readonly StudentSubscription[]> {
    this.plan.require('core.formulas');
    const rows = await this.subscriptions.listLiveByStudent(input.studentId);
    return rows.filter((s) => s.centerCode === input.centerCode);
  }
}
