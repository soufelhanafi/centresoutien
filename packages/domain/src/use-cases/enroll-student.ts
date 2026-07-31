import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { StudentSubscriptionReferencePort } from '../ports/student-subscription-reference';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { enrollmentInputSchema, type EnrollmentInput } from '../schemas/enrollment';
import { ENROLLMENT_ID_PREFIX, type Enrollment, type EnrollmentId } from '../entities/enrollment';
import type { StudentId } from '../entities/student';
import type { GroupId } from '../entities/group';
import { StudentNotFoundError } from '../errors/student-errors';
import { GroupNotFoundError } from '../errors/group-errors';
import {
  CrossKindEnrollmentError,
  DuplicateEnrollmentError,
  EnrollmentSubscriptionMissingError,
  GroupFullError,
} from '../errors/enrollment-errors';

export type EnrollStudentInput = EnrollmentInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Enrolls a student in a group. Gated by `core.groups` (every plan; the guard is
 * still explicit so the check has one home).
 *
 * Validates the user fields with the shared `enrollmentInputSchema`, then runs the
 * cross-entity checks a pure schema cannot, in this order:
 *
 *  1. The `groupId` resolves to a live group **of the same center**
 *     (`GroupNotFoundError`).
 *  2. The `studentId` resolves to a live student **of the same center**
 *     (`StudentNotFoundError`).
 *  3. The student does not already hold a live enrollment in the group — the
 *     idempotency guard (`DuplicateEnrollmentError`, SOU-123). Checked before
 *     capacity so a duplicate never inflates the seat count.
 *  4. The group is not at its seat ceiling — live enrollment count `<`
 *     `Group.capacity` (`GroupFullError`). This is the runtime seat-full guard
 *     SOU-48 deferred to this ticket.
 *  5. The student has an active subscription covering the group's `subjectId` for
 *     the enrollment's `startMonth` (`EnrollmentSubscriptionMissingError`), and
 *     that subscription's `kind` matches the group's `kind` — the exam-prep
 *     isolation rule (`CrossKindEnrollmentError`).
 *
 * Cross-center reads are rejected as "not found" — center scoping lives in the use
 * case, since `findById` does not scope (CLAUDE.md §5ter, one tenant per DB). The
 * subscription coverage comes from the declared-only `StudentSubscriptionReferencePort`
 * (SOU-63 supplies the real adapter). A fresh enrollment carries the full envelope
 * and is soft-deletable only.
 */
export class EnrollStudent {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly groups: GroupRepository,
    private readonly students: StudentRepository,
    private readonly subscriptions: StudentSubscriptionReferencePort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: EnrollStudentInput): Promise<Enrollment> {
    this.plan.require('core.groups');
    const fields = enrollmentInputSchema.parse(input);

    const groupId = fields.groupId as GroupId;
    const group = await this.groups.findById(groupId);
    if (group === null || group.centerCode !== input.centerCode) {
      throw new GroupNotFoundError(groupId);
    }

    const studentId = fields.studentId as StudentId;
    const student = await this.students.findById(studentId);
    if (student === null || student.centerCode !== input.centerCode) {
      throw new StudentNotFoundError(studentId);
    }

    // Idempotency guard (SOU-123): reject a second live enrollment of the same
    // student in the same group. Runs *before* the capacity guard so a duplicate
    // never inflates `countActiveByGroup` and fires `GroupFullError` against
    // phantom seats. On sync-resolve, `(studentId, groupId)` is the idempotency
    // key so two concurrent creates converge to one live row (Epic 9 — SOU-80/81).
    if (await this.enrollments.hasActiveEnrollment(studentId, groupId)) {
      throw new DuplicateEnrollmentError(studentId, groupId);
    }

    const seats = await this.enrollments.countActiveByGroup(groupId);
    if (seats >= group.capacity) {
      throw new GroupFullError(groupId, group.capacity);
    }

    // Coverage is verified at `startMonth` only, not re-checked across the
    // enrollment span: per-month coverage is an invoicing-time concern (monthly
    // subscriptions are close-and-reopen), not an enrollment-time one.
    // Pass the group's kind as the preferred track: when the subject is covered by
    // both a regular and an exam-prep subscription, the guard resolves to this
    // group's kind and never throws a spurious CrossKindEnrollmentError. A student
    // covered only by the other track still returns that (wrong) kind and trips the
    // guard; no coverage at all still returns null (missing-subscription).
    const coverage = await this.subscriptions.activeCoverage(
      studentId,
      group.subjectId,
      fields.startMonth,
      group.kind,
    );
    if (coverage === null) {
      throw new EnrollmentSubscriptionMissingError(
        studentId,
        groupId,
        group.subjectId,
        fields.startMonth,
      );
    }
    if (coverage.kind !== group.kind) {
      throw new CrossKindEnrollmentError(studentId, groupId, group.kind, coverage.kind);
    }

    const enrollment: Enrollment = {
      id: this.ids.next(ENROLLMENT_ID_PREFIX) as EnrollmentId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      studentId,
      groupId,
      startMonth: fields.startMonth,
      endMonth: fields.endMonth,
    };

    await this.enrollments.save(enrollment);
    return enrollment;
  }
}
