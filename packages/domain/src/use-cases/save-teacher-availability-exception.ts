import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { TeacherId } from '../entities/teacher';
import { newEnvelope } from '../entities/envelope';
import { applyWrite } from '../entities/write';
import { TeacherNotFoundError } from '../errors/people-errors';
import { TeacherAvailabilityExceptionNotFoundError } from '../errors/teacher-availability-errors';
import {
  teacherAvailabilityExceptionInputSchema,
  type TeacherAvailabilityExceptionInput,
} from '../schemas/teacher-availability';
import {
  TEACHER_AVAILABILITY_EXCEPTION_ID_PREFIX,
  type TeacherAvailabilityException,
  type TeacherAvailabilityExceptionId,
} from '../entities/teacher-availability-exception';

export type SaveTeacherAvailabilityExceptionInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** Omit to create a fresh absence; supply an existing id to edit that one. */
  id?: TeacherAvailabilityExceptionId;
} & TeacherAvailabilityExceptionInput;

/**
 * Creates or edits a one-off teacher absence (SOU-259) — the date-exception
 * layer over the weekly windows. Gated by `planning.teacher-availability`;
 * validates with the shared {@link teacherAvailabilityExceptionInputSchema}
 * (inclusive `end >= start` civil range, optional label). The target teacher
 * must be a live row of the same center ({@link TeacherNotFoundError}
 * otherwise). With an `id`, the live row is loaded and its `centerCode` checked
 * — unknown, tombstoned, or foreign ids throw
 * {@link TeacherAvailabilityExceptionNotFoundError} rather than silently
 * creating a second row; {@link applyWrite} keeps a no-op edit sync-quiet.
 */
export class SaveTeacherAvailabilityException {
  constructor(
    private readonly exceptions: TeacherAvailabilityExceptionRepository,
    private readonly teachers: TeacherRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: SaveTeacherAvailabilityExceptionInput): Promise<TeacherAvailabilityException> {
    this.plan.require('planning.teacher-availability');
    const fields = teacherAvailabilityExceptionInputSchema.parse(input);
    const teacherId = fields.teacherId as TeacherId;
    const dateRange: DateRange = { start: fields.dateRange.start, end: fields.dateRange.end };
    const label = fields.label === null || fields.label === '' ? null : fields.label;

    const teacher = await this.teachers.findById(teacherId);
    if (teacher === null || teacher.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(teacherId);
    }

    if (input.id === undefined) {
      const created: TeacherAvailabilityException = {
        id: this.ids.next(TEACHER_AVAILABILITY_EXCEPTION_ID_PREFIX) as TeacherAvailabilityExceptionId,
        ...newEnvelope(
          {
            centerCode: input.centerCode,
            deviceOrigin: input.deviceOrigin,
            updatedBy: input.updatedBy,
          },
          this.clock,
        ),
        teacherId,
        dateRange,
        label,
      };
      await this.exceptions.save(created);
      return created;
    }

    const existing = await this.exceptions.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new TeacherAvailabilityExceptionNotFoundError(input.id);
    }
    const { next, changedFields } = applyWrite(
      existing,
      { dateRange, label },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) await this.exceptions.save(next);
    return next;
  }
}
