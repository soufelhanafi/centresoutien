import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { TeacherAvailabilityExceptionId } from '../entities/teacher-availability-exception';
import { TeacherAvailabilityExceptionNotFoundError } from '../errors/teacher-availability-errors';

export type ArchiveTeacherAvailabilityExceptionInput = {
  centerCode: CenterCode;
  exceptionId: TeacherAvailabilityExceptionId;
  updatedBy: UserId;
};

/**
 * Soft-deletes a one-off teacher absence (SOU-259). Gated by
 * `planning.teacher-availability`. The live row must belong to the caller's
 * center — unknown, tombstoned, or foreign ids throw
 * {@link TeacherAvailabilityExceptionNotFoundError} so a stale id never
 * silently no-ops as success. Deletion is a write like any other: `deletedAt`
 * and `updatedBy` come from the injected clock and the acting user.
 */
export class ArchiveTeacherAvailabilityException {
  constructor(
    private readonly exceptions: TeacherAvailabilityExceptionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveTeacherAvailabilityExceptionInput): Promise<void> {
    this.plan.require('planning.teacher-availability');
    const existing = await this.exceptions.findById(input.exceptionId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new TeacherAvailabilityExceptionNotFoundError(input.exceptionId);
    }
    await this.exceptions.softDelete(input.exceptionId, this.clock.now(), input.updatedBy);
  }
}
