import type { GroupRepository } from '../ports/group-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Group } from '../entities/group';

/** Which slice of a center's groups to return: the live list or the archive. */
export type GroupScope = 'active' | 'archived';

export type ListGroupsInput = {
  centerCode: CenterCode;
  /** `'active'` (default view) or `'archived'` (the restore list). */
  scope: GroupScope;
};

/**
 * The stable, locale-agnostic list order: by `level`, then by `id` (ULID =
 * creation order) as a deterministic tiebreaker — so it never depends on adapter
 * row order (the in-memory fake and SQLite agree). Shared by {@link ListGroups}
 * and {@link ListGroupsWithCounts} so both list surfaces sort identically.
 */
export function orderGroupsForList(groups: readonly Group[]): Group[] {
  return [...groups].sort((a, b) => a.level.localeCompare(b.level) || a.id.localeCompare(b.id));
}

/**
 * Lists a center's groups for the list screen. Gated by `core.groups` (every
 * plan; the guard still has one home). `scope` selects the live groups or the
 * archived (tombstoned) ones so a single use case backs both the main list and
 * the restore view. Ordering is a stable, locale-agnostic default the use case
 * owns (see {@link orderGroupsForList}) so it does not depend on adapter row order
 * (the in-memory fake and SQLite agree). Mirrors {@link ListRooms}.
 */
export class ListGroups {
  constructor(
    private readonly groups: GroupRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListGroupsInput): Promise<readonly Group[]> {
    this.plan.require('core.groups');
    const groups =
      input.scope === 'archived'
        ? await this.groups.listArchived(input.centerCode)
        : await this.groups.listActive(input.centerCode);
    return orderGroupsForList(groups);
  }
}
