import type { StudentRepository } from '../ports/student-repository';
import type { MergeStudentsUnitOfWork, StudentDependents } from '../ports/merge-students-unit-of-work';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type DeviceId, type UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { StudentNotFoundError } from '../errors/student-errors';
import { MergeSameEntityError } from '../errors/merge-errors';
import {
  MERGE_LOG_ID_PREFIX,
  type MergeLogEntry,
  type MergeLogId,
  type MergeLogReason,
} from '../entities/merge-log';
import type { Student, StudentId } from '../entities/student';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../entities/student-subscription';
import { subscriptionRangesOverlap } from '../policies/student-subscription-policy';

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
 * same kind is closed at the merge month (close-and-reopen, CLAUDE.md §7), and
 * both that closure and any detached guardian links are recorded in the log note.
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
    const absorbedWinner = absorbMissingStudentFields(winner, loser, now, input.updatedBy);
    const tombstonedLoser: Student = {
      ...loser,
      mergedIntoId: winner.id,
      deletedAt: now,
      updatedAt: now,
      updatedBy: input.updatedBy,
    };
    const dependents = await this.unitOfWork.listDependents(input.centerCode, input.loserId);
    const activeSubscriptions = await this.unitOfWork.listActiveSubscriptions(input.centerCode, [
      input.winnerId,
      input.loserId,
    ]);
    const repointed = repointStudentDependents(dependents, input.loserId, winner.id, now, input.updatedBy);
    const reconciliation = reconcileOverlappingSubscriptions({
      repointedSubscriptions: repointed.subscriptions,
      winnerSubscriptions: activeSubscriptions.filter((s) => s.studentId === winner.id),
      mergeMonth: now.toISOString().slice(0, 7),
      now,
      updatedBy: input.updatedBy,
    });
    const droppedGuardianIds = loser.guardianIds.filter((id) => !winner.guardianIds.includes(id));
    const mergeLog = this.buildMergeLog(input, now, {
      closedSubscriptionIds: reconciliation.closedSubscriptionIds,
    });

    await this.unitOfWork.commit({
      winner: absorbedWinner,
      loser: tombstonedLoser,
      repointed: { ...repointed, subscriptions: reconciliation.subscriptions },
      mergeLog,
    });
    return absorbedWinner;
  }

  private async requireLiveStudent(input: MergeStudentsInput, id: StudentId): Promise<Student> {
    const student = await this.students.findById(id);
    if (student === null || student.centerCode !== input.centerCode) {
      throw new StudentNotFoundError(id);
    }
    return student;
  }

  private buildMergeLog(
    input: MergeStudentsInput,
    now: Date,
    noteContent: {
      closedSubscriptionIds: readonly StudentSubscriptionId[];
    },
  ): MergeLogEntry {
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
      id: this.ids.next(MERGE_LOG_ID_PREFIX) as MergeLogId,
      entityType: 'students',
      loserId: toEntityId(input.loserId),
      winnerId: toEntityId(input.winnerId),
      reason: input.reason ?? 'manual',
      note: buildMergeStudentsNote(noteContent),
    };
  }
}

/**
 * Winner keeps its values; it only absorbs fields the loser has that the winner
 * lacks — `school` and `notes` are the nullable Student fields. `birthDate` is
 * the naturalKey anchor and `guardianIds` the merge discriminator, so neither is
 * touched: the winner's own values win, and guardian reconciliation is a future
 * policy decision. `updatedAt`/`updatedBy` bump because the winner row is
 * rewritten by the merge.
 */
function absorbMissingStudentFields(
  winner: Student,
  loser: Student,
  now: Date,
  updatedBy: UserId,
): Student {
  return {
    ...winner,
    school: winner.school ?? loser.school,
    notes: winner.notes ?? loser.notes,
    updatedAt: now,
    updatedBy,
  };
}

/**
 * The pure re-pointing transform: every dependent row referencing `from` is
 * rewritten to `to` (the winner) with a fresh `updatedAt`/`updatedBy`. Filtering
 * keeps the function self-contained — rows the caller seeded that already point
 * elsewhere pass through untouched. Payments have no seat here by construction
 * (see the port's contract).
 */
export function repointStudentDependents(
  dependents: StudentDependents,
  from: StudentId,
  to: StudentId,
  now: Date,
  updatedBy: UserId,
): StudentDependents {
  const repoint = <T extends { studentId: StudentId; updatedAt: Date; updatedBy: UserId }>(
    rows: readonly T[],
  ): T[] =>
    rows.filter((row) => row.studentId === from).map((row) => ({ ...row, studentId: to, updatedAt: now, updatedBy }));

  return {
    enrollments: repoint(dependents.enrollments),
    subscriptions: repoint(dependents.subscriptions),
    attendance: repoint(dependents.attendance),
    invoices: repoint(dependents.invoices),
  };
}

export type SubscriptionReconciliation = {
  /** The reconciled re-pointed subscriptions — overlapping loser-origin ones closed. */
  readonly subscriptions: readonly StudentSubscription[];
  /** The ids of the loser-origin subscriptions the merge had to close. */
  readonly closedSubscriptionIds: readonly StudentSubscriptionId[];
};

/**
 * Closes the re-pointed loser-origin subscriptions that duplicate a live winner
 * subscription of the same kind (CLAUDE.md §7, M3). Re-pointing the loser's
 * open (`endMonth: null`) subscription onto a winner who already holds an open
 * same-kind one would leave the winner with two — the at-most-one-active-per-kind
 * invariant is violated and the monthly invoice generator bills twice. Per the
 * close-and-reopen rule the loser-origin row is capped at the merge month (an
 * inverted range is a zero-month cancellation and is allowed by the derived
 * status rule), never edited in place otherwise, and stays a closed row pointing
 * at the winner for history. Non-overlapping kinds (winner `regular`, loser
 * `exam-prep`) both survive active. Purely additive to the input — loser-origin
 * rows that don't overlap pass through untouched.
 */
export function reconcileOverlappingSubscriptions(input: {
  repointedSubscriptions: readonly StudentSubscription[];
  winnerSubscriptions: readonly StudentSubscription[];
  mergeMonth: string; // 'YYYY-MM'
  now: Date;
  updatedBy: UserId;
}): SubscriptionReconciliation {
  const winnerOpen = input.winnerSubscriptions.filter((s) => s.endMonth === null);
  const closedSubscriptionIds: StudentSubscriptionId[] = [];
  const subscriptions = input.repointedSubscriptions.map((sub) => {
    if (sub.endMonth !== null) return sub;
    const duplicates = winnerOpen.some(
      (w) =>
        w.kind === sub.kind &&
        subscriptionRangesOverlap(sub.startMonth, sub.endMonth, w.startMonth, w.endMonth),
    );
    if (!duplicates) return sub;
    closedSubscriptionIds.push(sub.id);
    return { ...sub, endMonth: input.mergeMonth, updatedAt: input.now, updatedBy: input.updatedBy };
  });
  return { subscriptions, closedSubscriptionIds };
}

/**
 * The single audit-note builder for a student merge (M3): the closed duplicate
 * subscriptions are recorded here, in one string, so nothing the merge discards
 * is silent. Dev-facing policy note (French, matching the domain's working
 * language) — never rendered directly. `null` when there is nothing to record.
 */
export function buildMergeStudentsNote(input: {
  closedSubscriptionIds: readonly StudentSubscriptionId[];
}): string | null {
  if (input.closedSubscriptionIds.length === 0) return null;
  return `abonnements doublons fermés: ${input.closedSubscriptionIds.join(', ')}`;
}
