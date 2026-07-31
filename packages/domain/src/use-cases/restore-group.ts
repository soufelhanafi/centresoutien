import type { GroupRepository } from '../ports/group-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { GroupNotFoundError } from '../errors/group-errors';
import type { Group, GroupId } from '../entities/group';
import type { CenterCode, UserId } from '../value-objects/ids';

export type RestoreGroupInput = {
  centerCode: CenterCode;
  groupId: GroupId;
  updatedBy: UserId;
};

/**
 * Restores an archived group — clears its tombstone (`deletedAt = null`) so it
 * returns to the live list. Gated by `core.groups`. The target is read via
 * `findArchivedById` (the only path that sees tombstones), and an unknown,
 * already-live, or foreign-center id raises {@link GroupNotFoundError} before
 * anything is touched.
 *
 * Unlike `RestoreRoom`, no plan limit is re-checked: no `maxGroups` cap exists,
 * so — like `CreateGroup` — a restore never counts against a limit. (The
 * exam-prep feature gate is intentionally not re-asserted here either; a group's
 * `kind` is immutable through this path, so restoring only revives what was
 * already permitted when it was created. `UpdateGroup` is where a kind change is
 * re-gated.)
 *
 * The clear-and-save reuses the ordinary write path: `updatedAt` (from the Clock
 * port, UTC) and `updatedBy` advance; `version` stays the hub's to assign; the
 * id, provenance, and `createdAt` are preserved. Mirrors {@link RestoreRoom}.
 */
export class RestoreGroup {
  constructor(
    private readonly groups: GroupRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: RestoreGroupInput): Promise<Group> {
    this.plan.require('core.groups');

    const archived = await this.groups.findArchivedById(input.groupId);
    if (archived === null || archived.centerCode !== input.centerCode) {
      throw new GroupNotFoundError(input.groupId);
    }

    const restored: Group = {
      ...archived,
      deletedAt: null,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    };
    await this.groups.save(restored);
    return restored;
  }
}
