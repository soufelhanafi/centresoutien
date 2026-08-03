import type {
  GetStudentAttendanceReport,
  GetGroupAttendanceSheet,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

export type GetStudentAttendanceReportUseCase = Pick<GetStudentAttendanceReport, 'execute'>;
export type GetGroupAttendanceSheetUseCase = Pick<GetGroupAttendanceSheet, 'execute'>;

export type AttendanceReportingHandlerDeps = {
  getStudentAttendanceReport: GetStudentAttendanceReportUseCase;
  getGroupAttendanceSheet: GetGroupAttendanceSheetUseCase;
};

export function createAttendanceReportingHandlers(
  deps: AttendanceReportingHandlerDeps,
): Pick<IpcHandlers, 'attendance.studentReport' | 'attendance.groupSheet'> {
  return {
    'attendance.studentReport': async (request) => {
      const report = await deps.getStudentAttendanceReport.execute({
        studentId: request.studentId,
        month: request.month,
        groupId: request.groupId ?? null,
      });
      return {
        studentId: report.studentId,
        history: report.history.map((row) => ({
          sessionId: row.sessionId,
          date: row.date,
          groupId: row.groupId,
          groupName: row.groupName,
          status: row.status,
          note: row.note,
        })),
        summary: {
          attendanceRatePercent: report.summary.attendanceRatePercent,
          consecutiveAbsences: report.summary.consecutiveAbsences,
          hasAbsenceStreak: report.summary.hasAbsenceStreak,
          counts: {
            present: report.summary.counts.present,
            absent: report.summary.counts.absent,
            excused: report.summary.counts.excused,
            late: report.summary.counts.late,
          },
        },
      };
    },
    'attendance.groupSheet': async (request) => {
      const sheet = await deps.getGroupAttendanceSheet.execute({
        groupId: request.groupId,
        month: request.month,
      });
      return {
        groupId: sheet.groupId,
        sessions: sheet.sessions.map((session) => ({
          sessionId: session.sessionId,
          date: session.date,
        })),
        students: sheet.students.map((student) => ({
          studentId: student.studentId,
          name: { fr: student.name.fr, ar: student.name.ar },
          cells: [...student.cells],
        })),
      };
    },
  };
}
