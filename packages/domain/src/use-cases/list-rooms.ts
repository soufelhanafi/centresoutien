import type { RoomRepository } from '../ports/room-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Room } from '../entities/room';

/** Which slice of a center's rooms to return: the live list or the archive. */
export type RoomScope = 'active' | 'archived';

export type ListRoomsInput = {
  centerCode: CenterCode;
  /** `'active'` (default view) or `'archived'` (the restore list). */
  scope: RoomScope;
};

/**
 * Lists a center's rooms for the list screen. Gated by `core.rooms` (every plan;
 * the guard still has one home). `scope` selects the live rooms or the archived
 * (tombstoned) ones so a single use case backs both the main list and the restore
 * view. Ordering is alphabetical by name — a stable, locale-agnostic default the
 * use case owns, so it does not depend on adapter row order (the in-memory fake
 * and SQLite agree).
 */
export class ListRooms {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListRoomsInput): Promise<readonly Room[]> {
    this.plan.require('core.rooms');
    const rooms =
      input.scope === 'archived'
        ? await this.rooms.listArchived(input.centerCode)
        : await this.rooms.listActive(input.centerCode);
    return [...rooms].sort((a, b) => a.name.localeCompare(b.name));
  }
}
