import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { buildTeacherNaturalKey } from '../policies/natural-key';
import { teacherInputSchema, type TeacherInput } from '../schemas/teacher';
import { TEACHER_ID_PREFIX, type Teacher, type TeacherId } from '../entities/teacher';
import type { SubjectId } from '../entities/subject';
import { DuplicateTeacherError } from '../errors/people-errors';

export type CreateTeacherInput = TeacherInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Teacher for a center. Gated by `core.teachers` (every plan; the guard
 * is the single source of truth for whether the feature is reachable) and bounded
 * by the plan's `maxTeachers` limit — the same shape as `CreateStudent` /
 * `CreateRoom`. Validates its input with the shared `teacherInputSchema` (phone
 * required + normalized to E.164), then stamps the immutable `naturalKey` from the
 * canonical phone so phone-anchored duplicate matching has its anchor. A shared
 * phone is allowed: a different name yields a different key, so both teachers save.
 * An exact match (same bilingual name + phone in the same center) is rejected with
 * a typed {@link DuplicateTeacherError} so the renderer gets a localizable error
 * instead of a raw DB constraint leak. A new teacher is always `active`.
 */
export class CreateTeacher {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateTeacherInput): Promise<Teacher> {
    this.plan.require('core.teachers');
    const fields = teacherInputSchema.parse({
      name: input.name,
      cin: input.cin,
      phone: input.phone,
      email: input.email,
      subjectIds: input.subjectIds,
    });

    const activeCount = await this.teachers.countActive(input.centerCode);
    this.plan.requireBelowLimit('maxTeachers', activeCount);

    const naturalKey = buildTeacherNaturalKey({
      centerCode: input.centerCode,
      name: fields.name,
      phone: fields.phone,
    });
    if (await this.teachers.findByNaturalKey(naturalKey)) {
      throw new DuplicateTeacherError(naturalKey);
    }

    const teacher: Teacher = {
      id: this.ids.next(TEACHER_ID_PREFIX) as TeacherId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      naturalKey,
      name: fields.name,
      cin: fields.cin,
      phone: fields.phone,
      email: fields.email,
      subjectIds: fields.subjectIds as SubjectId[],
      active: true,
    };

    await this.teachers.save(teacher);
    return teacher;
  }
}
