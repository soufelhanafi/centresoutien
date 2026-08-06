import type { Student, StudentId } from '../entities/student';
import type {
  StudentSubscription,
} from '../entities/student-subscription';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { toEntityId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import type { StudentDependents } from '../ports/merge-students-unit-of-work';
import type { MergeLogEntry, MergeLogReason } from '../entities/merge-log';
import {
  buildMergeStudentsNote,
  reconcileOverlappingSubscriptions,
} from './merge-subscription-reconciliation';

/**
 * Everything the student merge needs beyond the pure transforms: the winner's
 * absorbed fields, the loser tombstone, the re-pointed dependents with the
 * overlapping-subscription reconciliation applied, and the audit log entry.
 * Computed once and committed by the use case in a single unit-of-work call.
 */
export type StudentMergeUnit = {
  readonly winner: Student;
  readonly loser: Student;
  readonly repointed: StudentDependents;
  readonly mergeLog: MergeLogEntry;
};

export function computeStudentMergeUnit(input: {
  winner: Student;
  loser: Student;
  dependents: StudentDependents;
  liveSubscriptions: readonly StudentSubscription[];
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  reason: MergeLogReason;
  mergeLogId: MergeLogEntry['id'];
  now: Date;
}): StudentMergeUnit {
  const { winner, loser, now } = input;
  const absorbedWinner = absorbMissingStudentFields(winner, loser, now, input.updatedBy);
  const tombstonedLoser: Student = {
    ...loser,
    mergedIntoId: winner.id,
    deletedAt: now,
    updatedAt: now,
    updatedBy: input.updatedBy,
  };
  const repointed = repointStudentDependents(input.dependents, input.loser.id, winner.id, now, input.updatedBy);
  const reconciliation = reconcileOverlappingSubscriptions({
    repointedSubscriptions: repointed.subscriptions,
    winnerSubscriptions: input.liveSubscriptions.filter((s) => s.studentId === winner.id),
    mergeMonth: now.toISOString().slice(0, 7),
    now,
    updatedBy: input.updatedBy,
  });
  const droppedGuardianIds = loser.guardianIds.filter((id) => !winner.guardianIds.includes(id));
  const mergeLog: MergeLogEntry = {
    ...newEnvelope(
      {
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        updatedBy: input.updatedBy,
      },
      { now: () => now },
    ),
    createdAt: now,
    updatedAt: now,
    id: input.mergeLogId,
    entityType: 'students',
    loserId: toEntityId(loser.id),
    winnerId: toEntityId(winner.id),
    reason: input.reason,
    note: buildMergeStudentsNote({
      closedSubscriptionIds: reconciliation.closedSubscriptionIds,
      droppedGuardianIds,
    }),
  };
  return {
    winner: absorbedWinner,
    loser: tombstonedLoser,
    repointed: { ...repointed, subscriptions: reconciliation.subscriptions },
    mergeLog,
  };
}

/**
 * Winner keeps its values; it only absorbs fields the loser has that the winner
 * lacks — `school` and `notes` are the nullable Student fields. `birthDate` is
 * the naturalKey anchor and `guardianIds` the merge discriminator, so neither is
 * touched: the winner's own values win, and guardian reconciliation is a future
 * policy decision. `updatedAt`/`updatedBy` bump because the winner row is
 * rewritten by the merge.
 */
export function absorbMissingStudentFields(
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
