import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { FormulaRepository } from '../ports/formula-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { GenerateStudentMonthInvoice } from './generate-student-month-invoice';
import { STUDENT_MONTH_INVOICE_OUTCOMES } from './generate-student-month-invoice';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import {
  studentSubscriptionInputSchema,
  type StudentSubscriptionInput,
} from '../schemas/student-subscription';
import {
  STUDENT_SUBSCRIPTION_ID_PREFIX,
  type StudentSubscription,
  type StudentSubscriptionId,
} from '../entities/student-subscription';
import type { FormulaId } from '../entities/formula';
import type { InvoiceId } from '../entities/invoice';
import type { StudentId } from '../entities/student';
import type { SubjectId } from '../entities/subject';
import { StudentNotFoundError } from '../errors/student-errors';
import { TooManyActiveSubscriptionsError } from '../errors/subscription-errors';
import { subscriptionRangesOverlap } from '../policies/student-subscription-policy';

export type CreateStudentSubscriptionInput = StudentSubscriptionInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * What happened to the student's first invoice when the subscription was created
 * (SOU-289). The four {@link STUDENT_MONTH_INVOICE_OUTCOMES} come straight from the
 * shared per-student generation unit; the extra values are this hook's own:
 *  - `deferred-future-month` — `startMonth` is after the current month (Clock, UTC);
 *    nothing was generated, the monthly batch will bill it when the month arrives.
 *  - `formula-unresolved` — the subscription's `formulaId` resolved to no live
 *    same-center Formula (defensive; mirrors the batch's `unresolved` counter). The
 *    subscription is still created; no invoice was generated.
 *  - `invoicing-unavailable` — the active plan lacks `core.invoicing` (defensive;
 *    every shipped plan has it). The subscription is still created.
 *  - `generation-failed` — the generation unit threw after the subscription
 *    persisted (repository failure, unexpected race). The subscription is still
 *    created; no invoice is guaranteed. The caller surfaces it so the director can
 *    re-run the month's billing.
 */
export const SUBSCRIPTION_INVOICE_OUTCOMES = [
  ...STUDENT_MONTH_INVOICE_OUTCOMES,
  'deferred-future-month',
  'formula-unresolved',
  'invoicing-unavailable',
  'generation-failed',
] as const;
export type SubscriptionInvoiceOutcome = (typeof SUBSCRIPTION_INVOICE_OUTCOMES)[number];

export type SubscriptionInvoiceResult = {
  outcome: SubscriptionInvoiceOutcome;
  /** Set when an invoice was created or resolved (created / line-appended / already-billed / issued-skipped); null otherwise. */
  invoiceId: InvoiceId | null;
};

export type CreateStudentSubscriptionResult = {
  subscription: StudentSubscription;
  invoice: SubscriptionInvoiceResult;
};

/**
 * Subscribes a student to a Formula. Gated by `core.formulas` (every plan; the
 * guard is still explicit so the check has one home). An exam-prep subscription
 * additionally requires `core.exam-prep` (Pro+), mirroring `CreateGroup` — an
 * Essentiel center only ever holds `kind: 'regular'` subscriptions, keeping the
 * exam-prep track isolated.
 *
 * Validates the user fields with the shared `studentSubscriptionInputSchema`, then
 * runs the cross-entity checks a pure schema cannot:
 *
 *  1. The `studentId` resolves to a live student **of the same center**
 *     (`StudentNotFoundError`). Cross-center reads are rejected as "not found" —
 *     center scoping lives in the use case, since `findById` does not scope.
 *  2. No existing **live** subscription of the same `kind` overlaps the requested
 *     `[startMonth, endMonth|∞]` range (`TooManyActiveSubscriptionsError`) — the
 *     at-most-one-active-per-kind invariant. Two non-overlapping same-kind
 *     subscriptions (close-then-reopen) are allowed.
 *
 * The formula link is a frozen snapshot: `formulaId` is stored opaquely and the
 * `kind` + `subjectIds` supplied by the caller are persisted as-is. A fresh
 * subscription carries the full envelope and is soft-deletable only; status is
 * derived from the month range, never stored.
 *
 * **First-invoice hook (SOU-289).** After the subscription persists, if
 * `startMonth` is the current UTC month or earlier (backdated), the student's
 * draft invoice for `startMonth` is generated through the same
 * {@link GenerateStudentMonthInvoice} unit as the monthly batch — full formula
 * price, no proration; an existing draft gains a line instead of a second invoice;
 * an issued/cancelled invoice is left untouched. The hook never fails the
 * subscription: any error thrown by the generation unit after the subscription
 * persisted is contained and reported as `generation-failed`; its outcome is
 * reported in the result for the caller to surface.
 */
export class CreateStudentSubscription {
  constructor(
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly students: StudentRepository,
    private readonly formulas: FormulaRepository,
    private readonly generateStudentMonthInvoice: Pick<GenerateStudentMonthInvoice, 'execute'>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateStudentSubscriptionInput): Promise<CreateStudentSubscriptionResult> {
    this.plan.require('core.formulas');
    const fields = studentSubscriptionInputSchema.parse(input);
    if (fields.kind === 'exam-prep') {
      this.plan.require('core.exam-prep');
    }

    const studentId = fields.studentId as StudentId;
    const student = await this.students.findById(studentId);
    if (student === null || student.centerCode !== input.centerCode) {
      throw new StudentNotFoundError(studentId);
    }

    const sameKind = await this.subscriptions.listLiveByStudentAndKind(studentId, fields.kind);
    const overlaps = sameKind.some((s) =>
      subscriptionRangesOverlap(fields.startMonth, fields.endMonth, s.startMonth, s.endMonth),
    );
    if (overlaps) {
      throw new TooManyActiveSubscriptionsError(studentId, fields.kind);
    }

    const subscription: StudentSubscription = {
      id: this.ids.next(STUDENT_SUBSCRIPTION_ID_PREFIX) as StudentSubscriptionId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      studentId,
      formulaId: fields.formulaId as FormulaId,
      kind: fields.kind,
      subjectIds: fields.subjectIds.map((id) => id as SubjectId),
      startMonth: fields.startMonth,
      endMonth: fields.endMonth,
    };

    await this.subscriptions.save(subscription);
    const invoice = await this.generateFirstInvoice(subscription, input);
    return { subscription, invoice };
  }

  private async generateFirstInvoice(
    subscription: StudentSubscription,
    input: CreateStudentSubscriptionInput,
  ): Promise<SubscriptionInvoiceResult> {
    if (!this.plan.has('core.invoicing')) {
      return { outcome: 'invoicing-unavailable', invoiceId: null };
    }

    const currentMonth = this.clock.now().toISOString().slice(0, 7);
    if (subscription.startMonth > currentMonth) {
      return { outcome: 'deferred-future-month', invoiceId: null };
    }

    const formula = await this.formulas.findById(subscription.formulaId);
    if (formula === null || formula.centerCode !== input.centerCode) {
      return { outcome: 'formula-unresolved', invoiceId: null };
    }

    try {
      const result = await this.generateStudentMonthInvoice.execute({
        studentId: subscription.studentId,
        month: subscription.startMonth,
        lines: [
          {
            formulaId: formula.id,
            label: formula.name,
            kind: subscription.kind,
            amountMad: formula.priceMad,
          },
        ],
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        updatedBy: input.updatedBy,
      });
      return { outcome: result.outcome, invoiceId: result.invoiceId };
    } catch {
      return { outcome: 'generation-failed', invoiceId: null };
    }
  }
}
