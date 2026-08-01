import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
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
 * `kind` + `subjectIds` supplied by the caller are persisted as-is (no Formula
 * dereference — that entity does not exist yet). A fresh subscription carries the
 * full envelope and is soft-deletable only; status is derived from the month range,
 * never stored.
 */
export class CreateStudentSubscription {
  constructor(
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly students: StudentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateStudentSubscriptionInput): Promise<StudentSubscription> {
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
    return subscription;
  }
}
