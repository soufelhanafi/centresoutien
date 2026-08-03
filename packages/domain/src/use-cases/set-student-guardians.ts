import type { StudentRepository } from '../ports/student-repository';
import type { ParentRepository } from '../ports/parent-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { setStudentGuardiansInputSchema, type SetStudentGuardiansFields } from '../schemas/student';
import { StudentNotFoundError, StudentVersionConflictError } from '../errors/student-errors';
import { ParentNotFoundError } from '../errors/people-errors';
import type { ParentId, Student, StudentId } from '../entities/student';

export type SetStudentGuardiansInput = SetStudentGuardiansFields & {
  centerCode: CenterCode;
  id: StudentId;
  updatedBy: UserId;
};

/**
 * Sets a student's `guardianIds` link without replaying the rest of
 * `StudentInput` — the partial-update channel SOU-116 adds so that a stale
 * `UpdateStudent` snapshot (captured at render time, replayed later by the
 * undo-toast path) can no longer revert a name/level/notes edit that landed in
 * between. Gated by `core.students`, same as `UpdateStudent`.
 *
 * `expectedVersion` must match the student's current `version` or the write is
 * rejected with {@link StudentVersionConflictError} rather than applied blind —
 * the caller refetches and retries. This does not itself advance `version`;
 * per the envelope contract, `version` is hub-assigned only.
 *
 * Every id in `guardianIds` must resolve to a live Parent in the same center,
 * or the write is rejected with {@link ParentNotFoundError} — no silent link to
 * an unknown or archived guardian.
 */
export class SetStudentGuardians {
  constructor(
    private readonly students: StudentRepository,
    private readonly parents: ParentRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: SetStudentGuardiansInput): Promise<Student> {
    this.plan.require('core.students');
    const fields = setStudentGuardiansInputSchema.parse(input);

    const existing = await this.students.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new StudentNotFoundError(input.id);
    }

    if (existing.version !== fields.expectedVersion) {
      throw new StudentVersionConflictError(input.id, fields.expectedVersion, existing.version);
    }

    const guardianIds = fields.guardianIds as ParentId[];
    for (const guardianId of guardianIds) {
      const guardian = await this.parents.findById(guardianId);
      if (guardian === null || guardian.centerCode !== input.centerCode) {
        throw new ParentNotFoundError(guardianId);
      }
    }

    const updated: Student = {
      ...existing,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
      guardianIds,
    };

    await this.students.save(updated);
    return updated;
  }
}
