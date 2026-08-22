import { describe, expect, it } from 'vitest';
import { dedupeSingletonOccurrences } from '../../../src/renderer/lib/schedule-audit/dedupe-singleton-occurrences';
import type {
  StrandedGroupView,
  StrandedSessionView,
} from '../../../src/renderer/lib/schedule-audit/stranded-session-view';

function occurrence(id: string): StrandedSessionView {
  return {
    session: {
      id,
      recurringSessionId: 'rec_x',
      date: '2026-09-07',
      start: '15:00',
      end: '17:00',
      roomId: 'room_x',
      roomName: 'Salle A',
      roomCapacity: 20,
      roomArchived: false,
      teacherId: null,
      teacherName: null,
      groupId: null,
      subjectId: null,
      subjectName: null,
      level: null,
      kind: 'regular',
    },
    reasons: ['on-holiday', 'outside-center-hours'],
  };
}

function group(key: string, count: number, sessions: StrandedSessionView[]): StrandedGroupView {
  return {
    key,
    reason: 'on-holiday',
    weekday: 1,
    resourceKind: 'center',
    resourceId: null,
    count,
    occurrences: sessions,
  };
}

describe('dedupeSingletonOccurrences', () => {
  it('keeps collapsed groups untouched', () => {
    const collapsed = group('hours', 2, [occurrence('ses_1'), occurrence('ses_2')]);
    expect(dedupeSingletonOccurrences([collapsed])).toEqual([collapsed]);
  });

  it('drops a duplicate singleton group for the same session id, keeping the first', () => {
    const holiday = group('holiday', 1, [occurrence('ses_1')]);
    const hours = group('hours', 1, [occurrence('ses_1')]);
    expect(dedupeSingletonOccurrences([holiday, hours])).toEqual([holiday]);
  });

  it('keeps two distinct singleton sessions', () => {
    const a = group('holiday', 1, [occurrence('ses_1')]);
    const b = group('hours', 1, [occurrence('ses_2')]);
    expect(dedupeSingletonOccurrences([a, b])).toEqual([a, b]);
  });

  it('keeps a singleton that also appears inside a collapsed group', () => {
    const singleton = group('holiday', 1, [occurrence('ses_1')]);
    const collapsed = group('hours', 2, [occurrence('ses_1'), occurrence('ses_2')]);
    expect(dedupeSingletonOccurrences([singleton, collapsed])).toEqual([singleton, collapsed]);
  });
});
