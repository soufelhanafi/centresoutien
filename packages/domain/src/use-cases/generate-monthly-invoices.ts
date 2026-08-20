import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { FormulaRepository } from '../ports/formula-repository';
import type { GenerateStudentMonthInvoice } from './generate-student-month-invoice';
import type { PlanPolicy } from '../plans/plan-policy';
import { isSubscriptionActiveInMonth } from '../policies/student-subscription-policy';
import { generateMonthlyInvoicesSchema } from '../schemas/invoice';
import type { StudentSubscription } from '../entities/student-subscription';
import type { StudentId } from '../entities/student';
import type { FormulaId, Formula } from '../entities/formula';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';

export type GenerateMonthlyInvoicesInput = {
  centerCode: CenterCode;
  month: string;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

export type GenerateMonthlyInvoicesResult = {
  created: number;
  skipped: number;
  /** Students billable this month whose subscription(s) resolved to zero lines — see below. */
  unresolved: number;
};

/**
 * The monthly invoice generation job (SOU-68): for every student with a live
 * `StudentSubscription` active in `month`, produce one draft invoice with one line
 * per active subscription (a student on both a regular and an exam-prep formula
 * gets two lines on the same invoice).
 *
 * **Idempotent by construction.** This does not re-derive "already generated" —
 * it delegates every student to {@link GenerateStudentMonthInvoice} (SOU-289), the
 * same per-student unit the enrollment hook uses, so both paths share the exact
 * same dedup key (`findByStudentMonth` + `CreateInvoiceDraft`'s guard). A
 * `created` outcome counts as `created`; every other outcome — `already-billed`
 * (a straight re-run), `line-appended` (an existing draft was topped up with a
 * subscription line it was missing, e.g. one billed at enrollment before the
 * batch), and `issued-skipped` (the month's invoice is already frozen) — counts
 * as `skipped`, preserving the SOU-68 counters: re-running the job for a month
 * that was already generated produces zero new drafts.
 *
 * **N+1 avoidance for the 500-student/<2s target.** `Formula.listAll` is fetched
 * once and indexed into a map; every line's `label`/`amountMad` snapshot is
 * resolved from that map, never a per-student or per-line query. A subscription
 * whose `formulaId` misses that map — a tombstoned formula the subscription still
 * points at; no use case can tombstone an in-use formula today, so this is a
 * defensive branch, not a reachable one — contributes no line rather than
 * aborting the whole run. A student left with zero resolvable lines is counted in
 * `unresolved`, distinct from `skipped` (already billed) — an unresolved student
 * got no invoice at all and no signal otherwise, so the count exists to surface
 * that rather than let it disappear silently.
 */
export class GenerateMonthlyInvoices {
  constructor(
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly formulas: FormulaRepository,
    private readonly generateStudentMonthInvoice: Pick<GenerateStudentMonthInvoice, 'execute'>,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GenerateMonthlyInvoicesInput): Promise<GenerateMonthlyInvoicesResult> {
    this.plan.require('core.invoicing');
    const { month } = generateMonthlyInvoicesSchema.parse(input);

    const liveSubscriptions = await this.subscriptions.listLiveByCenter(input.centerCode);
    const activeSubscriptions = liveSubscriptions.filter((subscription) =>
      isSubscriptionActiveInMonth(subscription, month),
    );
    if (activeSubscriptions.length === 0) {
      return { created: 0, skipped: 0, unresolved: 0 };
    }

    const formulaById = new Map<FormulaId, Formula>(
      (await this.formulas.listAll(input.centerCode)).map((formula) => [formula.id, formula]),
    );

    const subscriptionsByStudent = groupByStudent(activeSubscriptions);

    let created = 0;
    let skipped = 0;
    let unresolved = 0;
    for (const [studentId, studentSubscriptions] of subscriptionsByStudent) {
      const lines = studentSubscriptions.flatMap((subscription) => {
        const formula = formulaById.get(subscription.formulaId);
        if (!formula) return [];
        return [
          {
            formulaId: formula.id,
            label: formula.name,
            kind: subscription.kind,
            amountMad: formula.priceMad,
          },
        ];
      });
      if (lines.length === 0) {
        unresolved += 1;
        continue;
      }

      const { outcome } = await this.generateStudentMonthInvoice.execute({
        studentId,
        month,
        lines,
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        updatedBy: input.updatedBy,
      });
      if (outcome === 'created') {
        created += 1;
      } else {
        skipped += 1;
      }
    }

    return { created, skipped, unresolved };
  }
}

function groupByStudent(
  subscriptions: readonly StudentSubscription[],
): Map<StudentId, StudentSubscription[]> {
  const byStudent = new Map<StudentId, StudentSubscription[]>();
  for (const subscription of subscriptions) {
    const forStudent = byStudent.get(subscription.studentId);
    if (forStudent) {
      forStudent.push(subscription);
    } else {
      byStudent.set(subscription.studentId, [subscription]);
    }
  }
  return byStudent;
}
