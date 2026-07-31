import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { applyWrite } from '../entities/write';
import { teacherInputSchema, type TeacherInput } from '../schemas/teacher';
import { TeacherNotFoundError } from '../errors/people-errors';
import type { Teacher, TeacherId } from '../entities/teacher';
import type { SubjectId } from '../entities/subject';

export type UpdateTeacherInput = TeacherInput & {
  centerCode: CenterCode;
  id: TeacherId;
  updatedBy: UserId;
};

/**
 * Edits an existing teacher's user-facing fields. Gated by `core.teachers`.
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, `active`, and `version` are never touched, and — per the entity
 * contract — the `naturalKey` is **not** recomputed even when the name or phone
 * change, so the duplicate engine keeps matching on the original key (and the
 * partial-unique index never trips on an edit). The write goes through
 * `applyWrite`, which advances `updatedAt` (from the Clock port) and `updatedBy`
 * and records the changed field names **only when something actually changed** — a
 * no-op edit returns the row untouched and emits no spurious sync delta (invariant
 * 5). Unknown or archived ids raise {@link TeacherNotFoundError} rather than
 * silently inserting a new row.
 */
export class UpdateTeacher {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateTeacherInput): Promise<Teacher> {
    this.plan.require('core.teachers');
    const fields = teacherInputSchema.parse({
      name: input.name,
      cin: input.cin,
      phone: input.phone,
      email: input.email,
      subjectIds: input.subjectIds,
    });

    const existing = await this.teachers.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(input.id);
    }

    const { next, changedFields } = applyWrite(
      existing,
      {
        name: fields.name,
        cin: fields.cin,
        phone: fields.phone,
        email: fields.email,
        subjectIds: fields.subjectIds as SubjectId[],
      },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.teachers.save(next);
    }
    return next;
  }
}
