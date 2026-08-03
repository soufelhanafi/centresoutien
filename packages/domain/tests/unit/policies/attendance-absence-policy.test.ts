import { describe, it, expect } from 'vitest';
import {
  countsTowardAbsenceStreak,
  longestConsecutiveAbsences,
  summarizeAttendance,
  ABSENCE_STREAK_THRESHOLD,
} from '../../../src/policies/attendance-absence-policy';
import type { AttendanceStatus } from '../../../src/entities/attendance-record';

describe('attendance absence policy (SOU-108)', () => {
  describe('countsTowardAbsenceStreak', () => {
    it('continues the run on absent and late', () => {
      expect(countsTowardAbsenceStreak('absent')).toBe(true);
      expect(countsTowardAbsenceStreak('late')).toBe(true);
    });

    it('breaks the run on present and excused', () => {
      expect(countsTowardAbsenceStreak('present')).toBe(false);
      expect(countsTowardAbsenceStreak('excused')).toBe(false);
    });
  });

  describe('longestConsecutiveAbsences', () => {
    it('is 0 for an empty window', () => {
      expect(longestConsecutiveAbsences([])).toBe(0);
    });

    it('is 0 when every status is present or excused', () => {
      const statuses: AttendanceStatus[] = ['present', 'excused', 'present'];
      expect(longestConsecutiveAbsences(statuses)).toBe(0);
    });

    it('counts a run of pure absences', () => {
      const statuses: AttendanceStatus[] = ['present', 'absent', 'absent', 'absent', 'present'];
      expect(longestConsecutiveAbsences(statuses)).toBe(3);
    });

    it('keeps late in the same run as absent', () => {
      const statuses: AttendanceStatus[] = ['absent', 'absent', 'late'];
      expect(longestConsecutiveAbsences(statuses)).toBe(3);
    });

    it('resets the run at present and excused', () => {
      const statuses: AttendanceStatus[] = ['absent', 'absent', 'excused', 'absent'];
      expect(longestConsecutiveAbsences(statuses)).toBe(2);
    });

    it('returns the longest run, not the last', () => {
      const statuses: AttendanceStatus[] = ['absent', 'absent', 'absent', 'present', 'absent', 'absent'];
      expect(longestConsecutiveAbsences(statuses)).toBe(3);
    });
  });

  describe('summarizeAttendance', () => {
    it('computes the SOU-100 rate formula (present share) and flags a ≥3 streak', () => {
      const summary = summarizeAttendance([
        { status: 'present' },
        { status: 'present' },
        { status: 'absent' },
        { status: 'absent' },
        { status: 'absent' },
      ] satisfies ReadonlyArray<{ status: AttendanceStatus }>);

      expect(summary.attendanceRatePercent).toBe(40); // 2 / 5
      expect(summary.consecutiveAbsences).toBe(3);
      expect(summary.hasAbsenceStreak).toBe(true);
      expect(summary.counts).toEqual({ present: 2, absent: 3, excused: 0, late: 0 });
    });

    it('does not flag a run shorter than the threshold', () => {
      const summary = summarizeAttendance([{ status: 'absent' }, { status: 'absent' }]);
      expect(summary.consecutiveAbsences).toBe(2);
      expect(summary.hasAbsenceStreak).toBe(false);
    });

    it('is 0 rate and no streak for an empty window, with complete counts', () => {
      const summary = summarizeAttendance([]);
      expect(summary.attendanceRatePercent).toBe(0);
      expect(summary.consecutiveAbsences).toBe(0);
      expect(summary.hasAbsenceStreak).toBe(false);
      expect(summary.counts).toEqual({ present: 0, absent: 0, excused: 0, late: 0 });
    });
  });

  it('exposes the streak threshold constant', () => {
    expect(ABSENCE_STREAK_THRESHOLD).toBe(3);
  });
});
