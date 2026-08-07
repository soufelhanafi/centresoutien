import type { StudentRepository } from '../ports/student-repository';
import type { MergeStudentsUnitOfWork } from '../ports/merge-students-unit-of-work';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type DeviceId, type UserId } from '../value-objects/ids';
import { StudentNotFoundError } from '../errors/student-errors';
import { MergeSameEntityError } from '../errors/merge-errors';
import {
  MERGE_LOG_ID_PREFIX,
  type MergeLogId,
  type MergeLogReason,
} from '../entities/merge-log';
import type { Student, StudentId } from '../entities/student';
import { computeStudentMergeUnit } from '../policies/merge-students-policy';

export type MergeStudentsInput = {
  winnerId: StudentId;
  loserId: StudentId;
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
 * Folds two duplicate Student records into one (sync-safe-entities step 8,
 * students matched on normalized name + guardian after parents are settled). The
 * winner keeps its `id` and absorbs the loser's missing fields; the loser becomes
 * a `deletedAt` tombstone carrying `mergedIntoId = winnerId`; every dependent —
 * enrollments, student-subscriptions, attendance records and invoices — that
 * referenced the loser is re-pointed onto the winner in ONE atomic unit of work;
 * and a `MergeLogEntry` is written for audit/undo. Payments are never merged or
 * re-pointed: they reference an invoice, not a student, and are append-only — a
 * probable double-entry is flagged in the conflicts inbox, never folded in.
 *
 * A merge never leaves the winner with two active same-kind subscriptions: a
 * re-pointed loser-origin subscription that duplicates a live winner one of the
 * same kind is closed so it never bills a month the winner covers — before the
 * merge month when the winner already bills it, or at the winner's start when
 * the winner begins later (close-and-reopen, CLAUDE.md §7). Both that closure
 * and any detached guardian links are recorded in the log note.
 *
 * Gated by `sync.conflict-resolution` — merging is settling a duplicate, so only
 * users authorized to resolve conflicts may run it. The whole merge is one
 * `commit` call on the injected {@link MergeStudentsUnitOfWork}, never N
 * independent repository awaits (SOU-169).
 */
export class MergeStudents {
  constructor(
    private readonly students: StudentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
    private readonly unitOfWork: MergeStudentsUnitOfWork,
  ) {}

  async execute(input: MergeStudentsInput): Promise<Student> {
    this.plan.require('sync.conflict-resolution');
    if (input.winnerId === input.loserId) {
      throw new MergeSameEntityError(toEntityId(input.winnerId));
    }

    const winner = await this.requireLiveStudent(input, input.winnerId);
    const loser = await this.requireLiveStudent(input, input.loserId);
    const now = this.clock.now();

    const unit = computeStudentMergeUnit({
      winner,
      loser,
      dependents: await this.unitOfWork.listDependents(input.centerCode, input.loserId),
      liveSubscriptions: await this.unitOfWork.listLiveSubscriptions(input.centerCode, [
        input.winnerId,
        input.loserId,
      ]),
      centerCode: input.centerCode,
      deviceOrigin: input.deviceOrigin,
      updatedBy: input.updatedBy,
      reason: input.reason ?? 'manual',
      mergeLogId: this.ids.next<MergeLogId>(MERGE_LOG_ID_PREFIX),
      now,
    });

    await this.unitOfWork.commit(unit);
    return unit.winner;
  }

  private async requireLiveStudent(input: MergeStudentsInput, id: StudentId): Promise<Student> {
    const student = await this.students.findById(id);
    if (student === null || student.centerCode !== input.centerCode) {
      throw new StudentNotFoundError(id);
    }
    return student;
  }
}

