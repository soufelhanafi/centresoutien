import { ATTENDANCE_STATUSES, type AttendanceStatus } from '../entities/attendance-record';
import type { AttendanceAbsenceSummary } from '../read-models/attendance-reporting';

/**
 * Pure absence-reporting rules (SOU-108). The domain's only time source is the
 * injected `Clock`; these helpers are pure integer/string math over the
 * read-model rows, exactly like `date-range` and `month`.
 */

/**
 * Roll-call outcomes that continue an "not fully present" streak: `absent` and
 * `late`. `present` and `excused` break the run (SOU-108 KICKOFF decision).
 */
export function countsTowardAbsenceStreak(status: AttendanceStatus): boolean {
  return status === 'absent' || status === 'late';
}

/** A streak is flagged once a run reaches this length. */
export const ABSENCE_STREAK_THRESHOLD = 3;

/**
 * The longest run of {@link countsTowardAbsenceStreak} statuses across
 * date-ordered items. Order is the caller's responsibility — rows arrive sorted
 * chronologically from the repository read.
 */
export function longestConsecutiveAbsences(statuses: readonly AttendanceStatus[]): number {
  let longest = 0;
  let current = 0;
  for (const status of statuses) {
    if (countsTowardAbsenceStreak(status)) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Build the absence summary from a window of (chronological) attendance rows.
 * `attendanceRatePercent` mirrors the SOU-100 dashboard formula
 * (`present / (present + absent + excused + late)`, rounded; `0` when empty).
 */
export function summarizeAttendance(
  rows: readonly { readonly status: AttendanceStatus }[],
): AttendanceAbsenceSummary {
  const counts = emptyStatusCounts();
  for (const row of rows) counts[row.status] += 1;

  const total = ATTENDANCE_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const attendanceRatePercent = total === 0 ? 0 : Math.round((counts.present / total) * 100);
  const consecutiveAbsences = longestConsecutiveAbsences(rows.map((row) => row.status));

  return {
    attendanceRatePercent,
    consecutiveAbsences,
    hasAbsenceStreak: consecutiveAbsences >= ABSENCE_STREAK_THRESHOLD,
    counts,
  };
}

function emptyStatusCounts(): Record<AttendanceStatus, number> {
  const counts = {} as Record<AttendanceStatus, number>;
  for (const status of ATTENDANCE_STATUSES) counts[status] = 0;
  return counts;
}
