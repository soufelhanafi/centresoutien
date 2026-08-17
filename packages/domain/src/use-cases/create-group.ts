import type { GroupRepository } from '../ports/group-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, EntityId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { groupInputSchema, type GroupInput } from '../schemas/group';
import { GROUP_ID_PREFIX, type Group, type GroupId } from '../entities/group';
import type { SubjectId } from '../entities/subject';
import type { NiveauId } from '../entities/niveau';
import { GroupSubjectUnavailableError } from '../errors/group-errors';

export type CreateGroupInput = GroupInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Group for a center. Gated by `core.groups` (every plan; the guard is
 * still explicit so the check has one home). An exam-prep group additionally
 * requires `core.exam-prep` (Pro+) — an Essentiel center can only ever create
 * `kind: 'regular'` groups.
 *
 * Validates the user fields with the shared `groupInputSchema` (the domain is the
 * authority even though the form validates first), then runs the cross-entity
 * check a pure schema cannot: the `subjectId` resolves to a live, active,
 * same-center Subject (`GroupSubjectUnavailableError`). A room is not attached
 * here — it is chosen at session creation (SOU-176). A new group is `active`.
 *
 * Cross-center reads are rejected as "not found" — center scoping lives in the use
 * case, since `findById` does not scope (CLAUDE.md §5ter, one tenant per DB).
 */
export class CreateGroup {
  constructor(
    private readonly groups: GroupRepository,
    private readonly subjects: SubjectRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateGroupInput): Promise<Group> {
    this.plan.require('core.groups');
    const fields = groupInputSchema.parse(input);
    if (fields.kind === 'exam-prep') {
      this.plan.require('core.exam-prep');
    }

    const subjectId = fields.subjectId as SubjectId;
    const subject = await this.subjects.findById(subjectId);
    if (subject === null || subject.centerCode !== input.centerCode) {
      throw new GroupSubjectUnavailableError(subjectId, 'not-found');
    }
    if (!subject.active) {
      throw new GroupSubjectUnavailableError(subjectId, 'inactive');
    }

    const group: Group = {
      id: this.ids.next(GROUP_ID_PREFIX) as GroupId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      subjectId,
      teacherId: fields.teacherId as EntityId | null,
      niveauId: (fields.niveauId ?? null) as NiveauId | null,
      level: fields.level,
      capacity: fields.capacity,
      kind: fields.kind,
      active: true,
    };

    await this.groups.save(group);
    return group;
  }
}
