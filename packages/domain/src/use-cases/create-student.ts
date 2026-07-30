import type { StudentRepository } from '../ports/student-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { buildStudentNaturalKey } from '../policies/natural-key';
import { studentInputSchema, type StudentInput } from '../schemas/student';
import {
  STUDENT_ID_PREFIX,
  type ParentId,
  type Student,
  type StudentId,
} from '../entities/student';

export type CreateStudentInput = StudentInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Student for a center. Gated by `core.students` (every plan; the guard
 * is still explicit so the check has one home) and bounded by the plan's
 * `maxStudents` limit. Validates its input with the shared `studentInputSchema`
 * — the domain is the authority even though the form validates first — then
 * stamps an immutable `naturalKey` for the duplicate engine.
 */
export class CreateStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateStudentInput): Promise<Student> {
    this.plan.require('core.students');
    const fields = studentInputSchema.parse(input);

    const activeCount = await this.students.countActive(input.centerCode);
    this.plan.requireBelowLimit('maxStudents', activeCount);

    const student: Student = {
      id: this.ids.next(STUDENT_ID_PREFIX) as StudentId,
      naturalKey: buildStudentNaturalKey({
        centerCode: input.centerCode,
        name: fields.name,
        birthDate: fields.birthDate,
      }),
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      name: fields.name,
      birthDate: fields.birthDate,
      level: fields.level,
      school: fields.school,
      notes: fields.notes,
      guardianIds: fields.guardianIds as ParentId[],
    };

    await this.students.save(student);
    return student;
  }
}
