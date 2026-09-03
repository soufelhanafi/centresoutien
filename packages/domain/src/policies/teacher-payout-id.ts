import { TEACHER_PAYOUT_ID_PREFIX, type TeacherPayoutId } from '../entities/teacher-payout';
import type { TeacherId } from '../entities/teacher';
import type { CenterCode } from '../value-objects/ids';

/**
 * Deterministic id for a `TeacherPayout`, a pure function of the `(centerCode,
 * teacherId, month)` triple that already IS the entity's identifying
 * relationship. Two devices computing the same teacher's month before syncing
 * independently arrive at the identical id, so a re-run or a second device's
 * run converges on the same row via the ordinary version-conflict path
 * instead of minting a duplicate payout.
 */
export function deriveTeacherPayoutId(
  centerCode: CenterCode,
  teacherId: TeacherId,
  month: string,
): TeacherPayoutId {
  return `${TEACHER_PAYOUT_ID_PREFIX}_${centerCode}_${teacherId}_${month}` as TeacherPayoutId;
}
