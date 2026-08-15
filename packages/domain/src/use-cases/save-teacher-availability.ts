import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import { newEnvelope } from '../entities/envelope';
import { applyWrite } from '../entities/write';
import { TeacherNotFoundError } from '../errors/people-errors';
import {
  teacherAvailabilityInputSchema,
  toWeeklyTimeWindows,
  type TeacherAvailabilityInput,
} from '../schemas/teacher-availability';
import {
  TEACHER_AVAILABILITY_ID_PREFIX,
  type TeacherAvailability,
  type TeacherAvailabilityId,
} from '../entities/teacher-availability';

export type SaveTeacherAvailabilityInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
} & TeacherAvailabilityInput;

/**
 * Creates or edits a teacher's weekly availability windows (SOU-259). Gated by
 * `planning.teacher-availability`. Validates with the shared
 * {@link teacherAvailabilityInputSchema} — the week-of-windows invariants are
 * the same ones the SOU-165 override schema enforces; the envelope is minted by
 * the use case, never by the form.
 *
 * The target teacher must be a live row of the same center
 * ({@link TeacherNotFoundError} otherwise — availability for an archived or
 * foreign teacher is meaningless). Upsert keyed on the teacher: with no
 * existing row a fresh one is created; otherwise {@link applyWrite} bumps
 * `updatedAt` only when the windows actually change, so re-saving an unchanged
 * week stays sync-quiet (invariant 5). `version` is the hub's to assign.
 */
export class SaveTeacherAvailability {
  constructor(
    private readonly availability: TeacherAvailabilityRepository,
    private readonly teachers: TeacherRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: SaveTeacherAvailabilityInput): Promise<TeacherAvailability> {
    this.plan.require('planning.teacher-availability');
    const fields = teacherAvailabilityInputSchema.parse(input);
    const teacherId = fields.teacherId as TeacherId;
    const weeklyWindows = toWeeklyTimeWindows(fields.weeklyWindows);

    const teacher = await this.teachers.findById(teacherId);
    if (teacher === null || teacher.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(teacherId);
    }

    const existing = await this.availability.findByTeacher(input.centerCode, teacherId);
    if (existing === null) {
      const created: TeacherAvailability = {
        id: this.ids.next(TEACHER_AVAILABILITY_ID_PREFIX) as TeacherAvailabilityId,
        ...newEnvelope(
          {
            centerCode: input.centerCode,
            deviceOrigin: input.deviceOrigin,
            updatedBy: input.updatedBy,
          },
          this.clock,
        ),
        teacherId,
        weeklyWindows,
      };
      await this.availability.save(created);
      return created;
    }

    const { next, changedFields } = applyWrite(
      existing,
      { weeklyWindows },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) await this.availability.save(next);
    return next;
  }
}
