import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { EnrollmentId } from '../entities/enrollment';
import type { CenterCode, UserId } from '../value-objects/ids';
import { EnrollmentNotFoundError } from '../errors/enrollment-errors';

export type UnenrollStudentInput = {
  centerCode: CenterCode;
  enrollmentId: EnrollmentId;
  updatedBy: UserId;
};

/*
 * Unenrolls a student (soft-deletes the enrollment), freeing the seat. Gated by
 * `core.groups`. The target is center-scoped: the enrollment is loaded first, and
 * an unknown, already-unenrolled, or foreign-center id raises a typed
 * EnrollmentNotFoundError before anything is touched — so a stale or wrong-tenant
 * id from the renderer can never silently no-op as a success (mirrors
 * ArchiveSubject). The row is soft-deleted (tombstone), never hard-deleted, so it
 * still syncs; the delete timestamp comes from the injected Clock (UTC), and the
 * actor's `updatedBy` is stamped so a delete-vs-edit conflict can show who
 * unenrolled, not just when.
 *
 * The group's current `teacherId` is snapshotted onto the tombstone
 * (`unenrolledUnderTeacherId`, SOU-301) so the departed student is later attributed
 * to the teacher who taught them, not to whoever the group is reassigned to
 * afterwards. The group is read from the same center; a group that no longer
 * resolves (archived/foreign) or is unstaffed snapshots `null`, which the teacher
 * roster attributes to no one rather than guessing a current teacher.
 */
export class UnenrollStudent {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly groups: GroupRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UnenrollStudentInput): Promise<void> {
    this.plan.require('core.groups');

    const existing = await this.enrollments.findById(input.enrollmentId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new EnrollmentNotFoundError(input.enrollmentId);
    }

    const group = await this.groups.findById(existing.groupId);
    const teacherId =
      group !== null && group.centerCode === input.centerCode ? group.teacherId : null;

    await this.enrollments.softDeleteUnderTeacher(
      input.enrollmentId,
      this.clock.now(),
      input.updatedBy,
      teacherId,
    );
  }
}
