import type { StudentRepository } from '../ports/student-repository';
import type { MergeStudentsUnitOfWork, StudentDependents } from '../ports/merge-students-unit-of-work';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type DeviceId, type UserId } from '../value-objects/ids';
import { previousMonth } from '../value-objects/month';
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
import type { ParentId } from '../entities/parent';
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
    const absorbedWinner = absorbMissingStudentFields(winner, loser, now, input.updatedBy);
    const tombstonedLoser: Student = {
      ...loser,
      mergedIntoId: winner.id,
      deletedAt: now,
      updatedAt: now,
      updatedBy: input.updatedBy,
    };
    const dependents = await this.unitOfWork.listDependents(input.centerCode, input.loserId);
    const liveSubscriptions = await this.unitOfWork.listLiveSubscriptions(input.centerCode, [
      input.winnerId,
      input.loserId,
    ]);
    const repointed = repointStudentDependents(dependents, input.loserId, winner.id, now, input.updatedBy);
    const reconciliation = reconcileOverlappingSubscriptions({
      repointedSubscriptions: repointed.subscriptions,
      winnerSubscriptions: liveSubscriptions.filter((s) => s.studentId === winner.id),
      mergeMonth: now.toISOString().slice(0, 7),
      now,
      updatedBy: input.updatedBy,
    });
    const droppedGuardianIds = loser.guardianIds.filter((id) => !winner.guardianIds.includes(id));
    const mergeLog = this.buildMergeLog(input, now, {
      closedSubscriptionIds: reconciliation.closedSubscriptionIds,
      droppedGuardianIds,
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
      droppedGuardianIds: readonly ParentId[];
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
 * Reconciles the re-pointed loser-origin subscriptions against the winner's own
 * live subscriptions so the winner never ends up with two billable subscriptions
 * of the same kind in any month from the merge month on (CLAUDE.md §7, M3).
 * Re-pointing the loser's open (`endMonth: null`) subscription onto a winner who
 * already holds an open same-kind one would violate the at-most-one-active-per-kind
 * invariant and make the monthly invoice generator bill twice.
 *
 * The loser-origin duplicate is closed via the close-and-reopen convention
 * (cap `endMonth`, never edited in place otherwise), and stays a closed row
 * pointing at the winner for history. Non-overlapping kinds (winner `regular`,
 * loser `exam-prep`) both survive active. Purely additive to the input — rows
 * that are already closed or don't overlap pass through untouched.
 *
 * **Which sub is closed, and at what month.** `endMonth` is inclusive, so the
 * retired row must never bill any month the kept coverage is already billing.
 * The kept coverage starts at the LATER of the merge month and the winner sub's
 * start — pre-merge months are two separate students' history and are left alone.
 * The loser-origin duplicate is capped at `previousMonth` of that coverage start:
 * when the winner already bills at the merge month the loser-origin closes before
 * the merge month (never double-bills it), and when the winner starts later the
 * loser-origin keeps billing until the month before the winner takes over (no
 * billing gap, no overlap). A cap that lands before the loser-origin's own start
 * month is an inverted range — the zero-month full cancellation the derived-status
 * rule permits (same convention as `CloseStudentSubscription`) — so a duplicate
 * that starts in the merge month is cancelled entirely rather than billed once.
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
    const overlappingWinner = earliestSameKindWinner(winnerOpen, sub);
    if (overlappingWinner === null) return sub;
    closedSubscriptionIds.push(sub.id);
    const coverageStart =
      overlappingWinner.startMonth > input.mergeMonth ? overlappingWinner.startMonth : input.mergeMonth;
    return {
      ...sub,
      endMonth: previousMonth(coverageStart),
      updatedAt: input.now,
      updatedBy: input.updatedBy,
    };
  });
  return { subscriptions, closedSubscriptionIds };
}

/**
 * The same-kind open winner subscription whose range overlaps `sub`, preferring
 * the earliest start — the one that begins billing first and therefore defines
 * when the loser-origin duplicate must stop. `null` when no winner sub of the
 * same kind overlaps (kinds differ, or ranges are disjoint).
 */
function earliestSameKindWinner(
  winnerOpen: readonly StudentSubscription[],
  sub: StudentSubscription,
): StudentSubscription | null {
  let earliest: StudentSubscription | null = null;
  for (const winner of winnerOpen) {
    if (winner.kind !== sub.kind) continue;
    if (!subscriptionRangesOverlap(sub.startMonth, sub.endMonth, winner.startMonth, winner.endMonth)) {
      continue;
    }
    if (earliest === null || winner.startMonth < earliest.startMonth) {
      earliest = winner;
    }
  }
  return earliest;
}

/**
 * The single audit-note builder for a student merge (M3 + M4): both the closed
 * duplicate subscriptions and the detached guardian links are recorded here, in
 * one string, so nothing the merge discards is silent. Dev-facing policy note
 * (French, matching the domain's working language) — never rendered directly.
 * `null` when there is nothing to record.
 */
export function buildMergeStudentsNote(input: {
  closedSubscriptionIds: readonly StudentSubscriptionId[];
  droppedGuardianIds: readonly ParentId[];
}): string | null {
  const parts: string[] = [];
  if (input.closedSubscriptionIds.length > 0) {
    parts.push(`abonnements doublons fermés: ${input.closedSubscriptionIds.join(', ')}`);
  }
  if (input.droppedGuardianIds.length > 0) {
    parts.push(`gardiens détachés: ${input.droppedGuardianIds.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}
