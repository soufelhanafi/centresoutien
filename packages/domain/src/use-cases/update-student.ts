import type { StudentRepository } from '../ports/student-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { studentInputSchema, type StudentInput } from '../schemas/student';
import { StudentNotFoundError } from '../errors/student-errors';
import type { ParentId, Student, StudentId } from '../entities/student';

export type UpdateStudentInput = StudentInput & {
  centerCode: CenterCode;
  id: StudentId;
  updatedBy: UserId;
};

/**
 * Edits an existing student's user-facing fields. Gated by `core.students`.
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched, and — per the entity contract —
 * the `naturalKey` is **not** recomputed even when the name or birth date change,
 * so the duplicate engine keeps matching on the original key. Only `updatedAt`
 * (from the Clock port) and `updatedBy` advance. Unknown or archived ids raise
 * {@link StudentNotFoundError} rather than silently inserting a new row.
 */
export class UpdateStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateStudentInput): Promise<Student> {
    this.plan.require('core.students');
    const fields = studentInputSchema.parse(input);

    const existing = await this.students.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new StudentNotFoundError(input.id);
    }

    const updated: Student = {
      ...existing,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
      name: fields.name,
      birthDate: fields.birthDate,
      level: fields.level,
      school: fields.school,
      notes: fields.notes,
      guardianIds: fields.guardianIds as ParentId[],
    };

    await this.students.save(updated);
    return updated;
  }
}
