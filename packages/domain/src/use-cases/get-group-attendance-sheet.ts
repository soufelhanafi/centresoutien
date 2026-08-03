import type { AttendanceRepository } from '../ports/attendance-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { GroupId } from '../entities/group';
import type { StudentId } from '../entities/student';
import type { AttendanceStatus } from '../entities/attendance-record';
import { monthDateRange } from '../value-objects/month';
import type { GroupAttendanceSheet } from '../read-models/attendance-reporting';

export type GetGroupAttendanceSheetInput = {
  groupId: string;
  /** Filtering window, strict `YYYY-MM`. */
  month: string;
};

/**
 * The printable per-group attendance sheet (SOU-108): for a group and month,
 * every live session of the group becomes a column and every student with a
 * recorded outcome becomes a row, cells populated from the group's attendance
 * records. The repo returns sessions + cells in one read; this use case
 * assembles the student × session matrix with `cells` **parallel to `sessions`**
 * for straightforward grid/PDF layout (a student with no record in a session
 * gets `null`). Read-model only. Gated by `core.attendance` (base tier).
 */
export class GetGroupAttendanceSheet {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetGroupAttendanceSheetInput): Promise<GroupAttendanceSheet> {
    this.plan.require('core.attendance');

    const groupId = input.groupId as GroupId;
    const data = await this.attendance.sheetForGroup(groupId, monthDateRange(input.month));

    const sessions = [...data.sessions].sort(
      (a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId),
    );
    const statusBySessionStudent = new Map<string, AttendanceStatus>();
    const nameByStudent = new Map<string, { readonly fr: string; readonly ar: string }>();
    for (const cell of data.cells) {
      statusBySessionStudent.set(`${cell.sessionId}:${cell.studentId}`, cell.status);
      if (!nameByStudent.has(cell.studentId)) nameByStudent.set(cell.studentId, cell.studentName);
    }

    const studentIds = [...new Set(data.cells.map((cell) => cell.studentId))] as StudentId[];

    const students = studentIds.map((studentId) => ({
      studentId,
      name: nameByStudent.get(studentId)!,
      cells: sessions.map(
        (session) => statusBySessionStudent.get(`${session.sessionId}:${studentId}`) ?? null,
      ),
    }));

    return { groupId, sessions, students };
  }
}
