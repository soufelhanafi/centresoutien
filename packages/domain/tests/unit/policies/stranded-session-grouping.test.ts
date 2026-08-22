import { describe, it, expect } from 'vitest';
import { groupStrandedSessions } from '../../../src/policies/stranded-session-grouping';
import type { StrandedSession } from '../../../src/policies/session-audit-reason';
import type { SessionOccurrenceView } from '../../../src/read-models/session-occurrence-view';
import type { SessionId } from '../../../src/entities/session';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { EntityId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';

const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
const TEACHER_1 = 'tch_00000000000000000000000001' as EntityId;
const TEACHER_2 = 'tch_00000000000000000000000002' as EntityId;

let seq = 0;
function occurrence(date: string, over: Partial<SessionOccurrenceView> = {}): SessionOccurrenceView {
  seq += 1;
  return {
    id: `ses_${String(seq).padStart(26, '0')}` as SessionId,
    recurringSessionId: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    date,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    roomId: ROOM_A,
    roomName: 'Salle A',
    roomCapacity: 5,
    roomArchived: false,
    teacherId: null,
    teacherName: null,
    groupId: GROUP,
    subjectId: SUBJECT,
    subjectName: { fr: 'Maths', ar: 'رياضيات' },
    level: '2e Bac',
    kind: 'regular',
    ...over,
  };
}

function stranded(date: string, reasons: StrandedSession['reasons'], over: Partial<SessionOccurrenceView> = {}): StrandedSession {
  return { session: occurrence(date, over), reasons };
}

describe('groupStrandedSessions', () => {
  it('collapses every occurrence of one (reason, weekday, resource) into a single bucket', () => {
    const rows = [
      stranded('2026-01-06', ['room-over-capacity']), // Tuesday
      stranded('2026-01-13', ['room-over-capacity']), // Tuesday
      stranded('2026-01-20', ['room-over-capacity']), // Tuesday
    ];
    const groups = groupStrandedSessions(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.reason).toBe('room-over-capacity');
    expect(groups[0]?.resourceKind).toBe('room');
    expect(groups[0]?.resourceId).toBe(ROOM_A);
    expect(groups[0]?.count).toBe(3);
    expect(groups[0]?.occurrences.map((o) => o.session.date)).toEqual(['2026-01-06', '2026-01-13', '2026-01-20']);
  });

  it('keeps room vs teacher findings on the same weekday distinct', () => {
    const rows = [
      stranded('2026-01-06', ['room-over-capacity']),
      stranded('2026-01-06', ['outside-teacher-availability'], { teacherId: TEACHER_1 }),
    ];
    const groups = groupStrandedSessions(rows);
    expect(groups.map((g) => g.reason)).toEqual(
      expect.arrayContaining(['room-over-capacity', 'outside-teacher-availability']),
    );
  });

  it('keeps two teachers unavailable on the same weekday distinct', () => {
    const rows = [
      stranded('2026-01-06', ['outside-teacher-availability'], { teacherId: TEACHER_1 }),
      stranded('2026-01-06', ['outside-teacher-availability'], { teacherId: TEACHER_2 }),
    ];
    const groups = groupStrandedSessions(rows);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.resourceId)).toEqual(expect.arrayContaining([TEACHER_1, TEACHER_2]));
  });

  it('keeps a one-off on its real date (group of one)', () => {
    const groups = groupStrandedSessions([stranded('2026-01-15', ['on-holiday'])]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(1);
    expect(groups[0]?.occurrences[0]?.session.date).toBe('2026-01-15');
  });

  it('puts a multi-reason occurrence into one bucket per reason', () => {
    const rows = [stranded('2026-01-06', ['room-over-capacity', 'room-double-booked'])];
    const groups = groupStrandedSessions(rows);
    expect(groups.map((g) => g.reason)).toEqual(expect.arrayContaining(['room-over-capacity', 'room-double-booked']));
    expect(groups).toHaveLength(2);
  });

  it('splits recurring rows by weekday', () => {
    const rows = [
      stranded('2026-01-06', ['room-over-capacity']), // Tuesday
      stranded('2026-01-07', ['room-over-capacity']), // Wednesday
    ];
    const groups = groupStrandedSessions(rows);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.weekday)).toEqual(expect.arrayContaining([2, 3]));
  });
});
