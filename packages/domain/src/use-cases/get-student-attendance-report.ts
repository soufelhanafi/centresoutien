import type { AttendanceRepository } from '../ports/attendance-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { StudentId } from '../entities/student';
import type { GroupId } from '../entities/group';
import { monthDateRange } from '../value-objects/month';
import { summarizeAttendance } from '../policies/attendance-absence-policy';
import type { StudentAttendanceReport } from '../read-models/attendance-reporting';

export type GetStudentAttendanceReportInput = {
  studentId: string;
  /** Filtering window, strict `YYYY-MM` — the Attendance tab's month selector. */
  month: string;
  /** Optional single-group filter; null/absent means all groups. */
  groupId?: string | null;
};

/**
 * The student-detail Attendance tab's read (SOU-108): the student's
 * session-by-session history for a month (optionally restricted to one group)
 * plus the absence summary (attendance rate + consecutive-absences streak) over
 * that same filtered window. Read-model only — derived from `AttendanceRepository`
 * (itself a pure join of attendance records onto the concrete `sessions` rows),
 * never a write. Gated by `core.attendance` (base tier).
 */
export class GetStudentAttendanceReport {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetStudentAttendanceReportInput): Promise<StudentAttendanceReport> {
    this.plan.require('core.attendance');

    const studentId = input.studentId as StudentId;
    const groupId = input.groupId ? (input.groupId as GroupId) : null;
    const range = monthDateRange(input.month);

    const rows = await this.attendance.listForStudent(studentId, range);
    const filtered = groupId ? rows.filter((row) => row.groupId === groupId) : rows;

    return { studentId, history: filtered, summary: summarizeAttendance(filtered) };
  }
}
