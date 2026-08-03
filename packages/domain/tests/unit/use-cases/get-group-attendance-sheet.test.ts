import { describe, it, expect, beforeEach } from 'vitest';
import { GetGroupAttendanceSheet } from '../../../src/use-cases/get-group-attendance-sheet';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { GroupId } from '../../../src/entities/group';
import type { SessionId } from '../../../src/entities/session';
import type { StudentId } from '../../../src/entities/student';
import type { GroupSheetData } from '../../../src/ports/attendance-repository';
import { InMemoryAttendanceRepository } from '../fakes/in-memory-attendance-repository';

const GROUP = 'grp_00000000000000000000000001' as GroupId;
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_B = 'stu_00000000000000000000000002' as StudentId;
const NAME_A = { fr: 'Alice', ar: 'أليس' };
const NAME_B = { fr: 'Bob', ar: 'بوب' };

function session(day: number): string {
  return `ses_${String(day).padStart(26, '0')}`;
}

let attendance: InMemoryAttendanceRepository;

const build = (plan: Plan = PLANS.essentiel) =>
  new GetGroupAttendanceSheet(attendance, new PlanPolicy(plan));

beforeEach(() => {
  attendance = new InMemoryAttendanceRepository();
});

describe('GetGroupAttendanceSheet (SOU-108)', () => {
  it('builds a matrix with sessions sorted chronologically and cells parallel to sessions', async () => {
    // Data arrives out of order on purpose — the use case must sort by date.
    const data: GroupSheetData = {
      sessions: [
        { sessionId: session(9) as SessionId, date: '2026-08-09' },
        { sessionId: session(2) as SessionId, date: '2026-08-02' },
      ],
      cells: [
        { studentId: STUDENT_A, studentName: NAME_A, sessionId: session(9) as SessionId, date: '2026-08-09', status: 'absent' },
        { studentId: STUDENT_B, studentName: NAME_B, sessionId: session(9) as SessionId, date: '2026-08-09', status: 'present' },
        { studentId: STUDENT_A, studentName: NAME_A, sessionId: session(2) as SessionId, date: '2026-08-02', status: 'present' },
      ],
    };
    attendance.setGroupSheet(GROUP, data);

    const result = await build().execute({ groupId: GROUP, month: '2026-08' });

    expect(result.groupId).toBe(GROUP);
    expect(result.sessions.map((s) => s.date)).toEqual(['2026-08-02', '2026-08-09']);

    // STUDENT_A has a record in both sessions; STUDENT_B only in the second.
    const byStudent = new Map(result.students.map((row) => [row.studentId, row]));
    expect(byStudent.get(STUDENT_A)?.name).toEqual(NAME_A);
    expect(byStudent.get(STUDENT_A)?.cells).toEqual(['present', 'absent']);
    expect(byStudent.get(STUDENT_B)?.name).toEqual(NAME_B);
    expect(byStudent.get(STUDENT_B)?.cells).toEqual([null, 'present']);
  });

  it('returns empty sessions and students for a group with no records in the month', async () => {
    const result = await build().execute({ groupId: GROUP, month: '2026-08' });

    expect(result.sessions).toEqual([]);
    expect(result.students).toEqual([]);
  });

  it('gates on core.attendance', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

    await expect(build(planWithout).execute({ groupId: GROUP, month: '2026-08' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
