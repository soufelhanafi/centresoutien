import type { ScheduleAuditGateway } from './schedule-audit-gateway';
import type { StrandedSessionView } from './stranded-session-view';

/**
 * Interim {@link ScheduleAuditGateway} (SOU-201) while the domain
 * `session.audit.outside-hours` / `session.cancel` channels land on this
 * worktree's typed IPC contract. The read side returns a small fixed sample in
 * the FINAL `StrandedSessionDto` shape so the real-IPC swap is one line; `cancel`
 * resolves without mutating the sample — the row's query invalidation is what
 * drops it in the real flow.
 */
const SAMPLE: readonly StrandedSessionView[] = [
  {
    reason: 'outside-center-hours',
    session: {
      id: 'ses_mock_outside_hours',
      recurringSessionId: 'wrs_mock_math',
      date: '2026-08-17',
      start: '19:30',
      end: '21:00',
      roomId: 'room_a',
      roomName: 'Salle A',
      teacherId: 'tch_mock_1',
      teacherName: { fr: 'M. Bennani', ar: 'الأستاذ بناني' },
      groupId: 'grp_math_1',
      subjectId: 'sub_math',
      subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
      level: '2 Bac SM',
      kind: 'regular',
    },
  },
  {
    reason: 'on-holiday',
    session: {
      id: 'ses_mock_on_holiday',
      recurringSessionId: 'wrs_mock_physique',
      date: '2026-08-14',
      start: '10:00',
      end: '12:00',
      roomId: 'room_b',
      roomName: 'Salle B',
      teacherId: 'tch_mock_2',
      teacherName: { fr: 'Mme Idrissi', ar: 'الأستاذة الإدريسي' },
      groupId: 'grp_physique_1',
      subjectId: 'sub_physique',
      subjectName: { fr: 'Physique', ar: 'الفيزياء' },
      level: '1 Bac SE',
      kind: 'exam-prep',
    },
  },
];

class MockScheduleAuditGateway implements ScheduleAuditGateway {
  async listOutsideHours(): Promise<readonly StrandedSessionView[]> {
    return SAMPLE;
  }

  async cancel(id: string): Promise<void> {
    // No-op mock: the real adapter POSTs `session.cancel` with this occurrence id.
    void id;
  }
}

export const mockScheduleAuditGateway: ScheduleAuditGateway = new MockScheduleAuditGateway();
