import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type { TeacherAvailability } from '../entities/teacher-availability';
import type { TeacherAvailabilityException } from '../entities/teacher-availability-exception';

export type GetTeacherAvailabilityInput = {
  centerCode: CenterCode;
  teacherId: TeacherId;
};

export type TeacherAvailabilityView = {
  readonly availability: TeacherAvailability | null;
  readonly exceptions: readonly TeacherAvailabilityException[];
};

/**
 * Reads one teacher's full availability picture for the Teacher screen
 * (SOU-259): the weekly windows row (`null` = unrestricted, nothing configured)
 * plus every live one-off absence, in one call so the tab renders from a single
 * IPC round trip. Gated by `planning.teacher-availability`. Read-only — an
 * unknown teacher simply reads as unrestricted with no exceptions, the same
 * empty state the editor starts from.
 */
export class GetTeacherAvailability {
  constructor(
    private readonly availability: TeacherAvailabilityRepository,
    private readonly exceptions: TeacherAvailabilityExceptionRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetTeacherAvailabilityInput): Promise<TeacherAvailabilityView> {
    this.plan.require('planning.teacher-availability');
    const [availability, exceptions] = await Promise.all([
      this.availability.findByTeacher(input.centerCode, input.teacherId),
      this.exceptions.listForTeacher(input.centerCode, input.teacherId),
    ]);
    return { availability, exceptions };
  }
}
