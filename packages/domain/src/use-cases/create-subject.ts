import type { SubjectRepository } from '../ports/subject-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { subjectInputSchema, type SubjectInput } from '../schemas/subject';
import { SUBJECT_ID_PREFIX, type Subject, type SubjectId } from '../entities/subject';
import { DuplicateSubjectCodeError } from '../errors/subject-errors';

export type CreateSubjectInput = SubjectInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Subject for a center. Gated by `core.subjects` (present on every
 * plan; the guard is still explicit so the check has one home). Validates its
 * input with the shared `subjectInputSchema` — the domain is the authority even
 * though the form validates first. When a `code` is supplied it must be unique
 * per center among live subjects: the guard consults `findByCode` and rejects a
 * clash with a typed {@link DuplicateSubjectCodeError}. An absent/blank code
 * normalizes to `null` (no code), and any number of subjects may have no code.
 */
export class CreateSubject {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateSubjectInput): Promise<Subject> {
    this.plan.require('core.subjects');
    const { name, code } = subjectInputSchema.parse({ name: input.name, code: input.code });

    const normalizedCode = code ?? null;
    if (normalizedCode !== null) {
      const clash = await this.subjects.findByCode(input.centerCode, normalizedCode);
      if (clash !== null) {
        throw new DuplicateSubjectCodeError(normalizedCode);
      }
    }

    const subject: Subject = {
      id: this.ids.next(SUBJECT_ID_PREFIX) as SubjectId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      name,
      code: normalizedCode,
      active: true,
    };

    await this.subjects.save(subject);
    return subject;
  }
}
