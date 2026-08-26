import type { StudentId } from '../entities/student';
import type { GroupId } from '../entities/group';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { TimeOfDay } from '../value-objects/time-of-day';
import { strictlyOverlaps } from './session-conflict-policy';

/**
 * A student can be enrolled in two independent `Group`s at once (e.g. a
 * "Math + Physique" formula puts them in one Math group and one Physics
 * group) — nothing about `Enrollment` or `Group` links the two, so nothing
 * prevents both groups from ending up scheduled at the same weekday+time.
 * Room and teacher conflicts stay green the whole time (different room,
 * different teacher), so this is invisible to every existing check. This
 * policy adds the missing student-level view: one weekly time block a
 * specific student attends, tagged with the group it belongs to so the
 * candidate's own group can be excluded (a group's own multiple weekly
 * slots are not a "conflict" — its whole roster simply attends all of them).
 */
export type StudentScheduledBlock = {
  readonly groupId: GroupId;
  readonly dayOfWeek: WeekdayIndex;
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
};

/** Every student's full weekly schedule across every group they're actively enrolled in. */
export type StudentScheduleIndex = ReadonlyMap<StudentId, readonly StudentScheduledBlock[]>;

/**
 * Folds each group's roster and weekly blocks into one schedule per student.
 * A group absent from `blocksByGroup` (not yet scheduled) or with an empty
 * roster simply contributes nothing — a student with no active enrollment
 * anywhere is absent from the returned map.
 */
export function buildStudentScheduleIndex(
  rosterByGroup: ReadonlyMap<GroupId, readonly StudentId[]>,
  blocksByGroup: ReadonlyMap<GroupId, readonly Omit<StudentScheduledBlock, 'groupId'>[]>,
): StudentScheduleIndex {
  const byStudent = new Map<StudentId, StudentScheduledBlock[]>();
  for (const [groupId, students] of rosterByGroup) {
    const blocks = blocksByGroup.get(groupId);
    if (blocks === undefined || blocks.length === 0) continue;
    const scheduled = blocks.map((block) => ({ groupId, ...block }));
    for (const studentId of students) {
      const existing = byStudent.get(studentId);
      if (existing === undefined) byStudent.set(studentId, [...scheduled]);
      else existing.push(...scheduled);
    }
  }
  return byStudent;
}

/** One student double-booked between the checked candidate and one of their other active groups. */
export type StudentDoubleBooking = {
  readonly studentId: StudentId;
  readonly otherGroupId: GroupId;
  readonly dayOfWeek: WeekdayIndex;
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
};

/**
 * Every student who would be double-booked if `candidate` (one weekly block
 * belonging to `candidate.groupId`) were scheduled: enrolled in `roster`
 * (the candidate group's own roster, or a single student when checking one
 * enrollment) AND already attending another active group whose block falls on
 * the same weekday and overlaps the candidate's time. A student's OTHER blocks
 * in `candidate.groupId` itself never count — same-group multi-weekly-slot
 * scheduling is not a per-student conflict.
 */
export function studentDoubleBookingsForCandidate(
  candidate: StudentScheduledBlock,
  roster: readonly StudentId[],
  studentIndex: StudentScheduleIndex,
): readonly StudentDoubleBooking[] {
  const conflicts: StudentDoubleBooking[] = [];
  for (const studentId of roster) {
    for (const block of studentIndex.get(studentId) ?? []) {
      if (block.groupId === candidate.groupId) continue;
      if (block.dayOfWeek !== candidate.dayOfWeek) continue;
      if (!strictlyOverlaps(candidate, block)) continue;
      conflicts.push({
        studentId,
        otherGroupId: block.groupId,
        dayOfWeek: block.dayOfWeek,
        start: block.start,
        end: block.end,
      });
    }
  }
  return conflicts;
}
