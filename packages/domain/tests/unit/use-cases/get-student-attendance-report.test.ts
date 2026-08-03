import { describe, it, expect, beforeEach } from 'vitest';
import { GetStudentAttendanceReport } from '../../../src/use-cases/get-student-attendance-report';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { StudentId } from '../../../src/entities/student';
import type { GroupId } from '../../../src/entities/group';
import type { SessionId } from '../../../src/entities/session';
import type { StudentAttendanceReading } from '../../../src/ports/attendance-repository';
import { InMemoryAttendanceRepository } from '../fakes/in-memory-attendance-repository';

const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const GROUP_A = 'grp_00000000000000000000000001' as GroupId;
const GROUP_B = 'grp_00000000000000000000000002' as GroupId;

function reading(day: number, groupId: GroupId | null, status: 'present' | 'absent' | 'excused' | 'late'): StudentAttendanceReading {
  return {
    sessionId: `ses_${String(day).padStart(26, '0')}` as SessionId,
    date: `2026-08-${String(day).padStart(2, '0')}`,
    groupId,
    status,
    note: null,
  };
}

let attendance: InMemoryAttendanceRepository;

const build = (plan: Plan = PLANS.essentiel) =>
  new GetStudentAttendanceReport(attendance, new PlanPolicy(plan));

beforeEach(() => {
  attendance = new InMemoryAttendanceRepository();
});

describe('GetStudentAttendanceReport (SOU-108)', () => {
  it('returns the student history across all groups when no group filter is given', async () => {
    attendance.setStudentReadings(STUDENT, [
      reading(1, GROUP_A, 'present'),
      reading(2, GROUP_B, 'absent'),
      reading(3, GROUP_A, 'present'),
    ]);

    const result = await build().execute({ studentId: STUDENT, month: '2026-08' });

    expect(result.studentId).toBe(STUDENT);
    expect(result.history).toHaveLength(3);
  });

  it('filters history to a single group when requested', async () => {
    attendance.setStudentReadings(STUDENT, [
      reading(1, GROUP_A, 'present'),
      reading(2, GROUP_B, 'absent'),
      reading(3, GROUP_A, 'present'),
    ]);

    const result = await build().execute({ studentId: STUDENT, month: '2026-08', groupId: GROUP_A });

    expect(result.history.map((row) => row.status)).toEqual(['present', 'present']);
  });

  it('computes the absence summary over the same filtered window', async () => {
    attendance.setStudentReadings(STUDENT, [
      reading(1, GROUP_A, 'absent'),
      reading(2, GROUP_A, 'absent'),
      reading(3, GROUP_A, 'absent'),
      reading(4, GROUP_A, 'present'),
    ]);

    const result = await build().execute({ studentId: STUDENT, month: '2026-08' });

    expect(result.summary.attendanceRatePercent).toBe(25); // 1 / 4
    expect(result.summary.consecutiveAbsences).toBe(3);
    expect(result.summary.hasAbsenceStreak).toBe(true);
  });

  it('returns an empty history and zeroed summary for a student with no records in the month', async () => {
    const result = await build().execute({ studentId: STUDENT, month: '2026-08' });

    expect(result.history).toEqual([]);
    expect(result.summary.attendanceRatePercent).toBe(0);
    expect(result.summary.hasAbsenceStreak).toBe(false);
  });

  it('gates on core.attendance', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

    await expect(build(planWithout).execute({ studentId: STUDENT, month: '2026-08' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
