import type { ParentRepository } from '../ports/parent-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { ParentNotFoundError } from '../errors/people-errors';
import type { ParentId } from '../entities/parent';

export type ArchiveParentInput = {
  centerCode: CenterCode;
  id: ParentId;
  updatedBy: UserId;
};

/**
 * Archives a guardian — a soft delete (sets `deletedAt`), never a hard delete, so
 * the tombstone syncs and history is preserved. Gated by `core.parents`. The
 * target is center-scoped (a foreign-tenant id reads as not-found), and the
 * deleter's `updatedBy` is stamped on the tombstone so the delete-vs-edit
 * conflict UI can show *who* archived, not just when. An unknown or
 * already-archived id raises {@link ParentNotFoundError}.
 *
 * Archiving a guardian does **not** cascade to their students: a child keeps its
 * `guardianIds` and the link is resolved when the guardian list is next viewed.
 * Re-parenting an orphaned child is a SOU-42 linking concern, not this delete.
 */
export class ArchiveParent {
  constructor(
    private readonly parents: ParentRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveParentInput): Promise<void> {
    this.plan.require('core.parents');
    const existing = await this.parents.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new ParentNotFoundError(input.id);
    }
    await this.parents.softDelete(input.id, this.clock.now(), input.updatedBy);
  }
}
