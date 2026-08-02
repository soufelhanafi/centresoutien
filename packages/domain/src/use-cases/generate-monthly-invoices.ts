import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { FormulaRepository } from '../ports/formula-repository';
import type { CreateInvoiceDraft } from './create-invoice-draft';
import type { PlanPolicy } from '../plans/plan-policy';
import { isSubscriptionActiveInMonth } from '../policies/student-subscription-policy';
import { generateMonthlyInvoicesSchema } from '../schemas/invoice';
import { DuplicateInvoiceError } from '../errors/invoice-errors';
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
};

/**
 * The monthly invoice generation job (SOU-68): for every student with a live
 * `StudentSubscription` active in `month`, produce one draft invoice with one line
 * per active subscription (a student on both a regular and an exam-prep formula
 * gets two lines on the same invoice, exactly like `CreateInvoiceDraft`).
 *
 * **Idempotent by construction.** This does not re-derive "already generated" —
 * it delegates every student to `CreateInvoiceDraft`, which already owns the
 * one-invoice-per-student-per-month guard, and treats {@link DuplicateInvoiceError}
 * as an expected no-op (`skipped`) rather than a failure. Re-running the job for a
 * month that was already generated therefore produces zero new drafts.
 *
 * **N+1 avoidance for the 500-student/<2s target.** `Formula.listAll` is fetched
 * once and indexed into a map; every line's `label`/`amountMad` snapshot is
 * resolved from that map, never a per-student or per-line query. A subscription
 * whose formula can't be resolved (should not happen — formulas are soft-delete
 * only) contributes no line rather than aborting the whole run; a student left
 * with zero resolvable lines is skipped, matching `CreateInvoiceDraft`'s own
 * refusal of an empty-lines draft.
 */
export class GenerateMonthlyInvoices {
  constructor(
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly formulas: FormulaRepository,
    private readonly createInvoiceDraft: Pick<CreateInvoiceDraft, 'execute'>,
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
      return { created: 0, skipped: 0 };
    }

    const formulaById = new Map<FormulaId, Formula>(
      (await this.formulas.listAll(input.centerCode)).map((formula) => [formula.id, formula]),
    );

    const subscriptionsByStudent = groupByStudent(activeSubscriptions);

    let created = 0;
    let skipped = 0;
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
      if (lines.length === 0) continue;

      try {
        await this.createInvoiceDraft.execute({
          studentId,
          month,
          lines,
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        });
        created += 1;
      } catch (error) {
        if (error instanceof DuplicateInvoiceError) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    return { created, skipped };
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
