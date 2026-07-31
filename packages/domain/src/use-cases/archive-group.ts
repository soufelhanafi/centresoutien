import type { GroupRepository } from '../ports/group-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { GroupId } from '../entities/group';
import type { CenterCode, UserId } from '../value-objects/ids';
import { GroupNotFoundError } from '../errors/group-errors';

export type ArchiveGroupInput = {
  centerCode: CenterCode;
  groupId: GroupId;
  updatedBy: UserId;
};

/**
 * Archives (soft-deletes) a Group. Gated by `core.groups`. The target is
 * center-scoped: the group is loaded first, and an unknown, already-archived, or
 * foreign-center id raises a typed {@link GroupNotFoundError} before anything is
 * touched — so a stale or wrong-tenant id from the renderer can never silently
 * no-op as a success (this mirrors `ArchiveRoom`/`ArchiveStudent`).
 *
 * Unlike `ArchiveRoom`, there is no in-use guard: nothing references a group yet
 * (the weekly session's group linkage lands with a later ticket, teacher/FK with
 * SOU-36). When those references exist, add a `GroupReferencePort` check here,
 * exactly as `ArchiveRoom` consults `RoomReferencePort`. Until then a group is
 * always free to archive.
 *
 * When archived it is soft-deleted (tombstone), never hard-deleted, so the row
 * still syncs. The delete timestamp comes from the injected `Clock` (UTC), never
 * `new Date()`, and the deleter's `updatedBy` is stamped on the tombstone so a
 * delete-vs-edit conflict can show *who* archived, not just when.
 */
export class ArchiveGroup {
  constructor(
    private readonly groups: GroupRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveGroupInput): Promise<void> {
    this.plan.require('core.groups');

    const existing = await this.groups.findById(input.groupId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new GroupNotFoundError(input.groupId);
    }

    await this.groups.softDelete(input.groupId, this.clock.now(), input.updatedBy);
  }
}
