import { describe, expect, it } from 'vitest';
import { groupStrandedSessions } from '../../../src/renderer/lib/schedule-audit/group-stranded';
import type {
  SessionAuditReason,
  StrandedSessionView,
} from '../../../src/renderer/lib/schedule-audit/stranded-session-view';

function stranded(
  recurringSessionId: string,
  date: string,
  reason: SessionAuditReason = 'outside-center-hours',
): StrandedSessionView {
  return {
    reason,
    session: {
      id: `ses_${recurringSessionId}_${date}`,
      recurringSessionId,
      date,
      start: '09:00',
      end: '10:30',
      roomId: 'rom_1',
      roomName: 'Salle 1',
      teacherId: null,
      teacherName: null,
      groupId: null,
      subjectId: null,
      subjectName: null,
      level: null,
      kind: 'regular',
    },
  };
}

describe('groupStrandedSessions', () => {
  it('collapses every stranded occurrence of one template into a single group, dates ascending', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-16'),
      stranded('wrs_a', '2026-09-02'),
      stranded('wrs_a', '2026-09-09'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.occurrences.map((o) => o.session.date)).toEqual([
      '2026-09-02',
      '2026-09-09',
      '2026-09-16',
    ]);
  });

  it('never merges two templates, even on the same weekday and slot', () => {
    const groups = groupStrandedSessions([stranded('wrs_a', '2026-09-02'), stranded('wrs_b', '2026-09-02')]);
    expect(groups).toHaveLength(2);
  });

  it('splits one template stranded for two different reasons into two honestly-badged groups', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-02', 'outside-center-hours'),
      stranded('wrs_a', '2026-09-09', 'on-holiday'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.reason).sort()).toEqual(['on-holiday', 'outside-center-hours']);
  });

  it('keeps a genuinely dated case as a group of one', () => {
    const groups = groupStrandedSessions([stranded('wrs_a', '2026-09-02')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.occurrences).toHaveLength(1);
  });

  it('orders groups by their earliest stranded date', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_late', '2026-10-01'),
      stranded('wrs_early', '2026-09-02'),
      stranded('wrs_early', '2026-09-09'),
    ]);

    expect(groups.map((group) => group.occurrences[0]!.session.recurringSessionId)).toEqual([
      'wrs_early',
      'wrs_late',
    ]);
  });

  it('returns no groups for an empty audit', () => {
    expect(groupStrandedSessions([])).toEqual([]);
  });
});
