import type { ParentRepository } from '../ports/parent-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { MergeParentsUnitOfWork } from '../ports/merge-parents-unit-of-work';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type DeviceId, type UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { ParentNotFoundError } from '../errors/people-errors';
import { MergeSameEntityError } from '../errors/merge-errors';
import {
  MERGE_LOG_ID_PREFIX,
  type MergeLogEntry,
  type MergeLogId,
  type MergeLogReason,
} from '../entities/merge-log';
import type { Parent, ParentId } from '../entities/parent';
import type { Student } from '../entities/student';

export type MergeParentsInput = {
  winnerId: ParentId;
  loserId: ParentId;
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /**
   * The duplicate-detection reason when the merge is executed by the sync engine
   * (exact-tier auto-merge); defaults to `manual` for an admin action from the UI.
   */
  reason?: MergeLogReason;
};

/**
 * Folds two duplicate Parent records into one (sync-safe-entities step 8,
 * parents-first matching). The winner keeps its `id` and absorbs the loser's
 * missing fields; the loser becomes a `deletedAt` tombstone carrying
 * `mergedIntoId = winnerId`; every live student whose `guardianIds` referenced
 * the loser is re-pointed onto the winner in the SAME atomic unit of work; and a
 * `MergeLogEntry` is written for audit/undo. Payments are never touched (they
 * reference invoices, not parents). Gated by `sync.conflict-resolution` — merging
 * is settling a duplicate, so only users authorized to resolve conflicts may run it.
 *
 * The merge is only the domain computation: `commit` is a single call on the
 * injected {@link MergeParentsUnitOfWork}, never N independent repository awaits,
 * so a late failure cannot leave dependents half re-pointed (SOU-169).
 */
export class MergeParents {
  constructor(
    private readonly parents: ParentRepository,
    private readonly students: StudentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
    private readonly unitOfWork: MergeParentsUnitOfWork,
  ) {}

  async execute(input: MergeParentsInput): Promise<Parent> {
    this.plan.require('sync.conflict-resolution');
    if (input.winnerId === input.loserId) {
      throw new MergeSameEntityError(toEntityId(input.winnerId));
    }

    const winner = await this.requireLiveParent(input, input.winnerId);
    const loser = await this.requireLiveParent(input, input.loserId);

    const now = this.clock.now();
    const absorbedWinner = absorbMissingParentFields(winner, loser, now, input.updatedBy);
    const tombstonedLoser: Parent = {
      ...loser,
      mergedIntoId: winner.id,
      deletedAt: now,
      updatedAt: now,
      updatedBy: input.updatedBy,
    };
    const repointedStudents = await this.repointGuardians(
      input.centerCode,
      input.loserId,
      winner.id,
      now,
      input.updatedBy,
    );
    const mergeLog = this.buildMergeLog(input, now);

    await this.unitOfWork.commit({
      winner: absorbedWinner,
      loser: tombstonedLoser,
      repointedStudents,
      mergeLog,
    });
    return absorbedWinner;
  }

  private async requireLiveParent(input: MergeParentsInput, id: ParentId): Promise<Parent> {
    const parent = await this.parents.findById(id);
    if (parent === null || parent.centerCode !== input.centerCode) {
      throw new ParentNotFoundError(id);
    }
    return parent;
  }

  private async repointGuardians(
    centerCode: CenterCode,
    loserId: ParentId,
    winnerId: ParentId,
    now: Date,
    updatedBy: UserId,
  ): Promise<readonly Student[]> {
    const linked = await this.students.listByGuardian(centerCode, loserId);
    return linked.map((student) => {
      const guardianIds = Array.from(
        new Set([...student.guardianIds].map((id) => (id === loserId ? winnerId : id))),
      );
      return { ...student, guardianIds, updatedAt: now, updatedBy };
    });
  }

  private buildMergeLog(input: MergeParentsInput, now: Date): MergeLogEntry {
    return {
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      createdAt: now,
      updatedAt: now,
      id: this.ids.next<MergeLogId>(MERGE_LOG_ID_PREFIX),
      entityType: 'parents',
      loserId: toEntityId(input.loserId),
      winnerId: toEntityId(input.winnerId),
      reason: input.reason ?? 'manual',
      note: null,
    };
  }
}

/**
 * Winner keeps its values; it only absorbs fields the loser has that the winner
 * lacks — `email` is the only nullable Parent field. Never overwrites the winner.
 * `updatedAt`/`updatedBy` bump because the winner row is rewritten by the merge.
 */
function absorbMissingParentFields(
  winner: Parent,
  loser: Parent,
  now: Date,
  updatedBy: UserId,
): Parent {
  return {
    ...winner,
    email: winner.email ?? loser.email,
    updatedAt: now,
    updatedBy,
  };
}
