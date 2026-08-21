import { describe, expect, it } from 'vitest';
import { groupStrandedSessions } from '../../../src/renderer/lib/schedule-audit/group-stranded';
import type {
  SessionAuditReason,
  SessionOccurrenceView,
  StrandedSessionView,
} from '../../../src/renderer/lib/schedule-audit/stranded-session-view';

// Wednesdays: 2026-09-02 / 09 / 16 · Mondays: 2026-09-07 / 14 · Thursday: 2026-09-03.

function stranded(
  recurringSessionId: string,
  date: string,
  reason: SessionAuditReason = 'outside-center-hours',
  overrides: Partial<SessionOccurrenceView> = {},
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
      ...overrides,
    },
  };
}

describe('groupStrandedSessions — SOU-296 key = conflict-type + weekday + primary resource', () => {
  it('collapses one conflict type + weekday + resource into a single group, dates ascending', () => {
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

  it('merges two templates double-booking the same teacher on the same weekday', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-02', 'teacher-double-booked', { teacherId: 'tch_1' }),
      stranded('wrs_b', '2026-09-09', 'teacher-double-booked', { teacherId: 'tch_1' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.occurrences).toHaveLength(2);
  });

  it('keeps two teachers unavailable on the same weekday distinct', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-02', 'teacher-unavailable', { teacherId: 'tch_1' }),
      stranded('wrs_b', '2026-09-09', 'teacher-unavailable', { teacherId: 'tch_2' }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('keeps two rooms double-booked on the same weekday distinct', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-02', 'room-double-booked', { roomId: 'rom_1' }),
      stranded('wrs_b', '2026-09-09', 'room-double-booked', { roomId: 'rom_2' }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('groups room-over-capacity by room (same room merges, different room splits)', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-02', 'room-over-capacity', { roomId: 'rom_1' }),
      stranded('wrs_b', '2026-09-09', 'room-over-capacity', { roomId: 'rom_1' }),
      stranded('wrs_c', '2026-09-09', 'room-over-capacity', { roomId: 'rom_2' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.occurrences.length).sort()).toEqual([1, 2]);
  });

  it('splits one template stranded for two different reasons into two honestly-badged groups', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-02', 'outside-center-hours'),
      stranded('wrs_a', '2026-09-09', 'holiday/blackout'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.reason).sort()).toEqual(['holiday/blackout', 'outside-center-hours']);
  });

  it('splits the same reason + resource across two different weekdays', () => {
    const groups = groupStrandedSessions([
      stranded('wrs_a', '2026-09-02', 'teacher-double-booked', { teacherId: 'tch_1' }), // Wed
      stranded('wrs_a', '2026-09-07', 'teacher-double-booked', { teacherId: 'tch_1' }), // Mon
    ]);

    expect(groups).toHaveLength(2);
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
