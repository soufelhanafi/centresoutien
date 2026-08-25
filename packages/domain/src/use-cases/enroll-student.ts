import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { StudentSubscriptionReferencePort } from '../ports/student-subscription-reference';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { enrollmentInputSchema, type EnrollmentInput } from '../schemas/enrollment';
import { ENROLLMENT_ID_PREFIX, type Enrollment, type EnrollmentId } from '../entities/enrollment';
import type { StudentId } from '../entities/student';
import type { GroupId } from '../entities/group';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { TimeOfDay } from '../value-objects/time-of-day';
import {
  buildStudentScheduleIndex,
  studentDoubleBookingsForCandidate,
  type StudentDoubleBooking,
} from '../policies/student-schedule-conflict';
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
 * A successful enrollment plus a non-blocking heads-up (never a rejection): the
 * newly-enrolled student already attends another group whose weekly schedule
 * overlaps this one's — invisible to room/teacher checks, since a shared
 * student sits outside both resources. `scheduleWarning` is `null` when clean.
 */
export type EnrollStudentResult = {
  readonly enrollment: Enrollment;
  readonly scheduleWarning: readonly StudentDoubleBooking[] | null;
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
 *
 * After the enrollment is persisted, a student-schedule check runs (never a
 * guard, never blocking): does the new group's own weekly schedule already
 * overlap another group this same student actively attends? If so, the result
 * carries a non-null `scheduleWarning` for the caller to surface — the student
 * stays enrolled either way, since a scheduling clash is a matter for an admin
 * to resolve (move groups, accept it), never a reason to refuse a paying
 * student's enrollment.
 */
export class EnrollStudent {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly groups: GroupRepository,
    private readonly students: StudentRepository,
    private readonly subscriptions: StudentSubscriptionReferencePort,
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: EnrollStudentInput): Promise<EnrollStudentResult> {
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
      unenrolledUnderTeacherId: null,
    };

    // Atomic check-then-insert (SOU-126): the `hasActiveEnrollment` pre-check above
    // yields the friendly error before the capacity/coverage work, but it and this
    // insert are separate awaits, so a same-device concurrent enroll can interleave
    // between them (both pass the pre-check). `saveIfAbsent` re-checks and inserts in
    // one transaction, so exactly one of two racing enrolls wins; the loser gets
    // `false` and the same `DuplicateEnrollmentError` — no duplicate live row, ever.
    const inserted = await this.enrollments.saveIfAbsent(enrollment);
    if (!inserted) {
      throw new DuplicateEnrollmentError(studentId, groupId);
    }

    const conflicts = await this.scheduleWarningFor(input.centerCode, studentId, groupId);
    return { enrollment, scheduleWarning: conflicts.length > 0 ? conflicts : null };
  }

  /**
   * The new group's own weekly blocks checked against every OTHER group the
   * student already actively attends — non-blocking, computed only after the
   * enrollment is already persisted, so it can never veto a paying student's
   * enrollment. Empty when the new group has no scheduled blocks yet, or the
   * student attends no other group.
   */
  private async scheduleWarningFor(
    centerCode: CenterCode,
    studentId: StudentId,
    groupId: GroupId,
  ): Promise<readonly StudentDoubleBooking[]> {
    const newGroupSessions = await this.sessions.listActiveByGroupId(centerCode, groupId);
    if (newGroupSessions.length === 0) return [];

    const otherGroupIds = [
      ...new Set(
        (await this.enrollments.listActiveByStudent(studentId))
          .map((e) => e.groupId)
          .filter((otherGroupId) => otherGroupId !== groupId),
      ),
    ];
    if (otherGroupIds.length === 0) return [];

    const blocksByGroup = new Map<GroupId, { dayOfWeek: WeekdayIndex; start: TimeOfDay; end: TimeOfDay }[]>();
    for (const otherGroupId of otherGroupIds) {
      const otherSessions = await this.sessions.listActiveByGroupId(centerCode, otherGroupId);
      blocksByGroup.set(
        otherGroupId,
        otherSessions.map((session) => ({ dayOfWeek: session.dayOfWeek, start: session.start, end: session.end })),
      );
    }
    const rosterByGroup = new Map(otherGroupIds.map((otherGroupId) => [otherGroupId, [studentId]] as const));
    const studentIndex = buildStudentScheduleIndex(rosterByGroup, blocksByGroup);

    return newGroupSessions.flatMap((session) =>
      studentDoubleBookingsForCandidate(
        { groupId, dayOfWeek: session.dayOfWeek, start: session.start, end: session.end },
        [studentId],
        studentIndex,
      ),
    );
  }
}
