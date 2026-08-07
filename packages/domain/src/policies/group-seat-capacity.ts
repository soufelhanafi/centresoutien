import type { GroupId } from '../entities/group';
import type { Room } from '../entities/room';
import { GroupOverCapacityError } from '../errors/group-errors';

/**
 * The one home of the seat-fit business rule: a group must never be bound to a
 * room that cannot seat its `capacity` (SOU-176 — rooms attach at session
 * creation, so the binding is a weekly recurring session, but the same rule
 * guards the capacity-edit paths on Group and Room). Every call site — the
 * session create/update gates and the UpdateGroup / UpdateRoom guards — uses
 * this, so the check can never drift. `capacity` is passed explicitly rather
 * than read off the group so the update guards can assert against a proposed
 * (not yet persisted) capacity.
 */
export function assertGroupFitsRoom(groupId: GroupId, capacity: number, room: Room): void {
  if (capacity > room.capacity) {
    throw new GroupOverCapacityError(groupId, capacity, room.id, room.capacity);
  }
}
