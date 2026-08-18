import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { Group, GroupId } from '../entities/group';
import type { RoomId } from '../entities/room';
import type { GenerationBatchId } from '../entities/session';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';
import type { WeeklyBlock } from '../value-objects/weekly-block';
import { GroupNotFoundError } from '../errors/group-errors';
import { GeneratedScheduleCapacityConflictError } from '../errors/session-generator-errors';
import {
  resolveGeneratorMaterializationRange,
  type SessionGeneratorRange,
} from '../services/session-generator';
import type { CreateWeeklyRecurringSession } from './create-weekly-recurring-session';
import type { GenerateAndPersistSessions } from './generate-and-persist-sessions';
import type { SkippedHolidayOccurrence } from './generate-sessions';

/**
 * One block the admin confirmed for commit (SOU-183). Deliberately NOT the pure
 * engine's {@link ScheduledBlockProposal}: this carries the admin's per-block
 * commit decision (`allowScheduleConflict`), which is a UI/write concern the
 * pure generator never produces. An EXCLUDED block is simply absent from its
 * group's `blocks` list — the caller drops it, this use case never sees it.
 */
export type CommitScheduledBlock = {
  readonly block: WeeklyBlock;
  readonly roomId: RoomId;
  /** `true` = force this block past a flagged schedule conflict, recording an intentional double-book. */
  readonly allowScheduleConflict: boolean;
};

/** One group's blocks to commit; excluded blocks are already dropped from `blocks`. */
export type CommitGroupProposal = {
  readonly groupId: GroupId;
  readonly blocks: readonly CommitScheduledBlock[];
};

export type CommitGeneratedScheduleInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** The same run's `config.mode` the preview was gated on — re-asserted here, since commit is the write path that actually matters. */
  mode: 'auto' | 'custom';
  /** The blocks the admin confirmed from a {@link PreviewGeneratedSchedule} run, each carrying its own force/keep decision. */
  proposals: readonly CommitGroupProposal[];
  /** The same run's materialization window; resolved per template below. */
  range: SessionGeneratorRange;
};

/** One committed weekly-recurring-session template and what its own materialization run produced. */
export type CommittedGeneratedTemplate = {
  readonly groupId: GroupId;
  readonly recurringSessionId: WeeklyRecurringSessionId;
  readonly generationBatchId: GenerationBatchId | null;
  readonly skippedHolidays: readonly SkippedHolidayOccurrence[];
};

export type CommitGeneratedScheduleResult = {
  readonly templates: readonly CommittedGeneratedTemplate[];
};

/**
 * Turns a confirmed SOU-158/159 generator preview into real, persisted state:
 * one {@link WeeklyRecurringSession} per block across every proposal, each
 * materialized into dated occurrences over the run's window. Reuses
 * {@link CreateWeeklyRecurringSession} and {@link GenerateAndPersistSessions}
 * verbatim rather than re-implementing their envelope, plan gate, or
 * scheduling checks — this use case is pure orchestration.
 *
 * **Never trusts the preview.** `proposals` came from a prior `preview` call
 * that may now be stale (another device/tab could have booked a slot since);
 * each block re-runs `CreateWeeklyRecurringSession`'s own composite conflict
 * check against the live schedule at write time, and each group's `teacherId`
 * is re-read fresh from {@link GroupRepository} rather than trusted from the
 * proposal (which never carried one — only `groupId` and the room-assigned
 * blocks). A group deleted since the preview rejects with
 * {@link GroupNotFoundError} rather than silently proceeding without a teacher.
 *
 * **Per-block force / exclude (SOU-183).** The admin's confirmed
 * {@link CommitGroupProposal} carries one decision per block. A block flagged
 * `allowScheduleConflict` is committed even when it clashes (recorded with
 * `conflictAccepted = true`); an *excluded* block is simply never sent — the
 * caller drops it from `blocks`, so this use case only ever commits what it is
 * given. Forcing only bypasses the schedule-conflict check; the seat-fit and
 * not-found hard checks inside `CreateWeeklyRecurringSession` always run.
 *
 * **Capacity conflicts are non-forceable and reject the whole batch (SOU-275).**
 * Before committing any block, a pre-flight pass re-reads each group's live
 * capacity and each block's assigned room, and throws
 * {@link GeneratedScheduleCapacityConflictError} if any block's room cannot seat
 * its group — regardless of `allowScheduleConflict`, since seat overflow is a
 * hard invariant, not a double-book the admin may accept. The block is never
 * auto-dropped: the whole run is refused up front (nothing persisted) so the
 * admin fixes the room/group config and re-previews. This is an earlier, cleaner
 * guard than the {@link assertGroupFitsRoom} invariant inside
 * `CreateWeeklyRecurringSession`, which stays in place as defense in depth but
 * would otherwise fire mid-run, after earlier blocks had already committed.
 *
 * Blocks are committed **sequentially, not in parallel**: each
 * `CreateWeeklyRecurringSession` call reads the repository's live state, so an
 * earlier block in this same run is already visible to the room-conflict check
 * on the next one — the same intra-batch reasoning
 * `detectGeneratedScheduleConflicts` used at preview time, now enforced by the
 * real write path instead of guessed from sibling proposals. There is no
 * cross-block rollback: a conflict partway through the run leaves every
 * already-committed template in place and aborts the rest, so the caller sees
 * exactly which templates made it into `templates` before the throw (via a
 * partially-consumed proposals list) — the admin re-opens the preview to retry
 * only what is left.
 *
 * `range`'s `{ startDate, occurrenceCount }` variant is resolved to a concrete
 * window per template via {@link resolveGeneratorMaterializationRange}, since
 * every template is single-weekday and the same occurrence count lands on a
 * different end date depending on which weekday the template sits on.
 *
 * Gated per `input.mode` on `planning.custom-grid` (Pro) or `planning.random-auto`
 * (Premium) — this is the write path, so it re-asserts the same tier
 * {@link PreviewGeneratedSchedule} gated on rather than trusting the preview call.
 */
export class CommitGeneratedSchedule {
  constructor(
    private readonly groups: GroupRepository,
    private readonly rooms: RoomRepository,
    private readonly createWeeklySession: CreateWeeklyRecurringSession,
    private readonly generateAndPersist: GenerateAndPersistSessions,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CommitGeneratedScheduleInput): Promise<CommitGeneratedScheduleResult> {
    this.plan.require(input.mode === 'auto' ? 'planning.random-auto' : 'planning.custom-grid');
    const { centerCode, deviceOrigin, updatedBy, proposals, range } = input;

    await this.assertEveryBlockFitsItsRoom(centerCode, proposals);

    const templates: CommittedGeneratedTemplate[] = [];
    for (const proposal of proposals) {
      const { teacherId } = await this.resolveGroup(centerCode, proposal.groupId);
      for (const scheduled of proposal.blocks) {
        const created = await this.createWeeklySession.execute({
          centerCode,
          deviceOrigin,
          updatedBy,
          roomId: scheduled.roomId,
          teacherId,
          groupId: proposal.groupId,
          dayOfWeek: scheduled.block.dayOfWeek,
          start: scheduled.block.start,
          end: scheduled.block.end,
          active: true,
          validFrom: null,
          validTo: null,
          allowScheduleConflict: scheduled.allowScheduleConflict,
        });

        const materialized = await this.generateAndPersist.execute({
          centerCode,
          recurringSessionId: created.id,
          range: resolveGeneratorMaterializationRange(range, scheduled.block.dayOfWeek),
          deviceOrigin,
          updatedBy,
        });

        templates.push({
          groupId: proposal.groupId,
          recurringSessionId: created.id,
          generationBatchId: materialized.generationBatchId,
          skippedHolidays: materialized.skippedHolidays,
        });
      }
    }
    return { templates };
  }

  /**
   * The whole-batch capacity guard (SOU-275): re-reads every group's live
   * capacity and every block's assigned room up front, throwing before a single
   * block is committed so a run with any seat overflow leaves nothing persisted.
   * A room missing since the preview is left to `CreateWeeklyRecurringSession`'s
   * own not-found check in the commit loop — only a present, too-small room is a
   * capacity conflict here.
   */
  private async assertEveryBlockFitsItsRoom(
    centerCode: CenterCode,
    proposals: readonly CommitGroupProposal[],
  ): Promise<void> {
    for (const proposal of proposals) {
      const group = await this.resolveGroup(centerCode, proposal.groupId);
      for (const scheduled of proposal.blocks) {
        const room = await this.rooms.findById(scheduled.roomId);
        if (room !== null && group.capacity > room.capacity) {
          throw new GeneratedScheduleCapacityConflictError(group.id, room.id, group.capacity, room.capacity);
        }
      }
    }
  }

  private async resolveGroup(centerCode: CenterCode, groupId: GroupId): Promise<Group> {
    const group = await this.groups.findById(groupId);
    if (group === null || group.centerCode !== centerCode) {
      throw new GroupNotFoundError(groupId);
    }
    return group;
  }
}
