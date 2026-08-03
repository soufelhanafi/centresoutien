import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { previousMonth } from '../value-objects/month';
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
import {
  StudentSubscriptionNotFoundError,
  TooManyActiveSubscriptionsError,
} from '../errors/subscription-errors';
import { subscriptionRangesOverlap } from '../policies/student-subscription-policy';

export type ReplaceStudentSubscriptionInput = StudentSubscriptionInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** The currently-live same-kind subscription this replaces — closed one month before the new one starts. */
  activeSubscriptionId: StudentSubscriptionId;
};

export type ReplaceStudentSubscriptionResult = {
  /** The just-capped incumbent subscription (its new `endMonth` = the month before `startMonth`). */
  closed: StudentSubscription;
  /** The fresh replacement subscription. */
  created: StudentSubscription;
};

/**
 * The close-and-reopen convention as ONE operation (CLAUDE.md §7): a mid-course
 * formula change is a close of the current live subscription plus a fresh
 * same-kind subscription starting a later month. SOU-141 — the historic
 * two-call `close → create` dance in the renderer left a student with **no**
 * active subscription if the create failed after the close committed. This use
 * case issues both as a single atomic `replaceLiveSubscription` write.
 *
 * Gated by `core.formulas` (every plan); an exam-prep replacement additionally
 * requires `core.exam-prep` (Pro+), mirroring `CreateStudentSubscription`.
 * Validates the fields with the shared schema, resolves the **same-center**
 * student, and resolves the incumbent center-scoped — an unknown,
 * already-tombstoned, or foreign-center id raises
 * {@link StudentSubscriptionNotFoundError} before anything is touched. It then
 * runs the at-most-one-active-per-kind overlap guard for the new range against
 * every other live subscription of the same kind for that student (the
 * incumbent being replaced is excluded — it is about to be closed). The
 * incumbent is capped at the month *before* the replacement starts.
 *
 * Both entities are stamped with the injected `Clock` (UTC) and the actor's
 * `updatedBy`; a fresh ULID is minted for the replacement. The write is a
 * single atomic repository call — see
 * {@link StudentSubscriptionRepository.replaceLiveSubscription}.
 */
export class ReplaceStudentSubscription {
  constructor(
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly students: StudentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ReplaceStudentSubscriptionInput): Promise<ReplaceStudentSubscriptionResult> {
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

    const active = await this.subscriptions.findById(input.activeSubscriptionId);
    if (active === null || active.centerCode !== input.centerCode) {
      throw new StudentSubscriptionNotFoundError(input.activeSubscriptionId);
    }

    const sameKind = await this.subscriptions.listLiveByStudentAndKind(studentId, fields.kind);
    const overlaps = sameKind.some(
      (s) =>
        s.id !== input.activeSubscriptionId &&
        subscriptionRangesOverlap(fields.startMonth, fields.endMonth, s.startMonth, s.endMonth),
    );
    if (overlaps) {
      throw new TooManyActiveSubscriptionsError(studentId, fields.kind);
    }

    const now = this.clock.now();
    const closed: StudentSubscription = {
      ...active,
      endMonth: previousMonth(fields.startMonth),
      updatedAt: now,
      updatedBy: input.updatedBy,
    };

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

    await this.subscriptions.replaceLiveSubscription(closed, subscription);
    return { closed, created: subscription };
  }
}
