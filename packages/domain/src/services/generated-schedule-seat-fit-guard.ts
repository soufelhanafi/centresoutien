import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { CenterCode } from '../value-objects/ids';
import type { CommitGroupProposal } from '../use-cases/commit-generated-schedule';
import { GroupNotFoundError } from '../errors/group-errors';
import { GeneratedScheduleCapacityConflictError } from '../errors/session-generator-errors';

/**
 * The whole-batch seat-fit pre-flight for a confirmed generator commit (SOU-275).
 *
 * Capacity overflow is a hard invariant, not a double-book the admin may accept:
 * a `capacity` conflict is **non-forceable** and rejects the **entire** run up
 * front — before {@link CommitGeneratedSchedule} persists a single block — so a
 * batch with any room too small for its group leaves nothing behind and the admin
 * fixes the room/group config and re-previews. It re-reads each group's live
 * capacity and each block's assigned room rather than trusting the (possibly
 * stale) preview. A room missing since the preview is deliberately ignored here
 * and left to `CreateWeeklyRecurringSession`'s own not-found check in the commit
 * loop — only a present, too-small room is a capacity conflict. This is the
 * earlier, cleaner guard than the `assertGroupFitsRoom` invariant inside
 * `CreateWeeklyRecurringSession`, which stays as defense in depth but would
 * otherwise fire mid-run, after earlier blocks had already committed.
 */
export class GeneratedScheduleSeatFitGuard {
  constructor(
    private readonly groups: GroupRepository,
    private readonly rooms: RoomRepository,
  ) {}

  async assertEveryBlockFits(
    centerCode: CenterCode,
    proposals: readonly CommitGroupProposal[],
  ): Promise<void> {
    for (const proposal of proposals) {
      const group = await this.groups.findById(proposal.groupId);
      if (group === null || group.centerCode !== centerCode) {
        throw new GroupNotFoundError(proposal.groupId);
      }
      for (const scheduled of proposal.blocks) {
        const room = await this.rooms.findById(scheduled.roomId);
        if (room !== null && group.capacity > room.capacity) {
          throw new GeneratedScheduleCapacityConflictError(
            group.id,
            room.id,
            group.capacity,
            room.capacity,
          );
        }
      }
    }
  }
}
