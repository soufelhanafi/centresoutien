import type { GroupRepository } from '../ports/group-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, EntityId, UserId } from '../value-objects/ids';
import type { GroupId } from '../entities/group';
import type { GenerationBatchId } from '../entities/session';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';
import { GroupNotFoundError } from '../errors/group-errors';
import {
  resolveGeneratorMaterializationRange,
  type GroupScheduleProposal,
  type SessionGeneratorRange,
} from '../services/session-generator';
import type { CreateWeeklyRecurringSession } from './create-weekly-recurring-session';
import type { GenerateAndPersistSessions } from './generate-and-persist-sessions';
import type { SkippedHolidayOccurrence } from './generate-sessions';

export type CommitGeneratedScheduleInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** The proposals the admin confirmed from a {@link PreviewGeneratedSchedule} run — echoed back verbatim. */
  proposals: readonly GroupScheduleProposal[];
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
 */
export class CommitGeneratedSchedule {
  constructor(
    private readonly groups: GroupRepository,
    private readonly createWeeklySession: CreateWeeklyRecurringSession,
    private readonly generateAndPersist: GenerateAndPersistSessions,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CommitGeneratedScheduleInput): Promise<CommitGeneratedScheduleResult> {
    this.plan.require('core.calendar.week');
    const { centerCode, deviceOrigin, updatedBy, proposals, range } = input;

    const templates: CommittedGeneratedTemplate[] = [];
    for (const proposal of proposals) {
      const teacherId = await this.resolveTeacherId(centerCode, proposal.groupId);
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

  private async resolveTeacherId(centerCode: CenterCode, groupId: GroupId): Promise<EntityId | null> {
    const group = await this.groups.findById(groupId);
    if (group === null || group.centerCode !== centerCode) {
      throw new GroupNotFoundError(groupId);
    }
    return group.teacherId;
  }
}
