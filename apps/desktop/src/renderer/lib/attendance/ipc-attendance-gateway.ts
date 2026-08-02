import type { AttendanceGateway } from './attendance-gateway';
import type { AttendanceRecordView, RollCallRecordInput, WeeklySlotOption } from './attendance-view';

/**
 * The real {@link AttendanceGateway}. `weeklySlotsForGroup` reads `session.week`
 * (the same channel the planner grid uses) and filters client-side by `groupId`,
 * mirroring the grid's own client-side filtering (contract comment on
 * `session.week`). `resolveSession` calls `session.generate` with `from === to`
 * — the use case is idempotent, so this is safe to call every submit without
 * risking duplicate sessions. No business logic lives here — only shape mapping.
 */
class IpcAttendanceGateway implements AttendanceGateway {
  async weeklySlotsForGroup(groupId: string): Promise<readonly WeeklySlotOption[]> {
    const { sessions } = await window.api.invoke('session.week', {});
    return sessions
      .filter((session) => session.groupId === groupId)
      .map((session) => ({
        recurringSessionId: session.id,
        dayOfWeek: session.dayOfWeek,
        start: session.start,
        end: session.end,
      }));
  }

  async resolveSession(recurringSessionId: string, date: string): Promise<{ sessionId: string }> {
    const { sessions } = await window.api.invoke('session.generate', {
      recurringSessionId,
      from: date,
      to: date,
    });
    const [session] = sessions;
    if (session === undefined) {
      throw new Error(`no session materialized for ${recurringSessionId} on ${date}`);
    }
    return { sessionId: session.id };
  }

  async submit(
    sessionId: string,
    records: readonly RollCallRecordInput[],
  ): Promise<readonly AttendanceRecordView[]> {
    const response = await window.api.invoke('attendance.record', {
      sessionId,
      records: records.map((record) => ({ studentId: record.studentId, status: record.status })),
    });
    return response.records;
  }
}

export const ipcAttendanceGateway: AttendanceGateway = new IpcAttendanceGateway();
