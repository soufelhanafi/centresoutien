import type { GroupRepository } from '../ports/group-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { groupInputSchema, type GroupInput } from '../schemas/group';
import {
  GroupNotFoundError,
  GroupSubjectUnavailableError,
} from '../errors/group-errors';
import type { Group, GroupId } from '../entities/group';
import type { SubjectId } from '../entities/subject';
import type { CenterCode, EntityId, UserId } from '../value-objects/ids';

export type UpdateGroupInput = GroupInput & {
  centerCode: CenterCode;
  id: GroupId;
  updatedBy: UserId;
};

/**
 * Edits a group's user-facing fields (subject, teacher, level, capacity, kind).
 * Gated by `core.groups`; switching a group to `kind: 'exam-prep'`
 * additionally requires `core.exam-prep` (Pro+), exactly like `CreateGroup` — an
 * Essentiel center can never end up owning an exam-prep group by editing one.
 *
 * Validates with the shared `groupInputSchema` (the domain is the authority even
 * though the form validates first), then re-runs the same cross-entity check
 * `CreateGroup` does — it is an invariant of a group at rest, not just at
 * creation: the `subjectId` resolves to a live, active, same-center Subject
 * (`GroupSubjectUnavailableError`). Skipping it on update would let a group be
 * re-pointed at a foreign/archived subject — a state creation forbids. Rooms are
 * not edited here; they attach at session creation (SOU-176).
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched — `version` is the hub's to
 * assign, so a local edit must not bump it. The write goes through `applyWrite`,
 * which advances `updatedAt` (from the Clock port) and `updatedBy` and records
 * the changed field names **only when something actually changed** — a no-op edit
 * returns the row untouched and emits no spurious sync delta. Unknown, archived,
 * or foreign-center ids raise {@link GroupNotFoundError} rather than inserting a
 * new row. Mirrors {@link UpdateRoom}.
 */
export class UpdateGroup {
  constructor(
    private readonly groups: GroupRepository,
    private readonly subjects: SubjectRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateGroupInput): Promise<Group> {
    this.plan.require('core.groups');
    const fields = groupInputSchema.parse(input);
    if (fields.kind === 'exam-prep') {
      this.plan.require('core.exam-prep');
    }

    const existing = await this.groups.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new GroupNotFoundError(input.id);
    }

    const subjectId = fields.subjectId as SubjectId;
    const subject = await this.subjects.findById(subjectId);
    if (subject === null || subject.centerCode !== input.centerCode) {
      throw new GroupSubjectUnavailableError(subjectId, 'not-found');
    }
    if (!subject.active) {
      throw new GroupSubjectUnavailableError(subjectId, 'inactive');
    }

    const { next, changedFields } = applyWrite(
      existing,
      {
        subjectId,
        teacherId: fields.teacherId as EntityId | null,
        level: fields.level,
        capacity: fields.capacity,
        kind: fields.kind,
      },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.groups.save(next);
    }
    return next;
  }
}
