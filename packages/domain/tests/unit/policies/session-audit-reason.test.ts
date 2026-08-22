import { describe, it, expect } from 'vitest';
import { auditReasonsFor, type SessionAuditContext } from '../../../src/policies/session-audit-reason';
import { buildResourceScheduleIndex } from '../../../src/policies/session-resource-conflict';
import type { SessionOccurrenceView } from '../../../src/read-models/session-occurrence-view';
import type { SessionId } from '../../../src/entities/session';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { HolidayId } from '../../../src/entities/holiday';
import type { EntityId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { HolidayOccurrence } from '../../../src/policies/holiday-policy';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { WeeklyTimeWindows } from '../../../src/entities/center-hours-override';
import type { TimeWindow } from '../../../src/value-objects/time-window';

const ROOM = 'rom_00000000000000000000000001' as RoomId;
const OTHER_ROOM = 'rom_00000000000000000000000002' as RoomId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;
const OTHER_TEACHER = 'tch_00000000000000000000000002' as EntityId;
const WRS_ID = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const THURSDAY: WeekdayIndex = 4;

let seq = 0;
function occurrence(over: Partial<SessionOccurrenceView> = {}): SessionOccurrenceView {
  seq += 1;
  const id = `ses_${String(seq).padStart(26, '0')}` as SessionId;
  return {
    id,
    recurringSessionId: WRS_ID,
    date: '2026-01-08', // Thursday
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    roomId: ROOM,
    roomName: 'Salle A',
    roomCapacity: 20,
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

function weekWindows(byDay: Partial<Record<WeekdayIndex, readonly TimeWindow[]>>): WeeklyTimeWindows {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...byDay } as WeeklyTimeWindows;
}

function dayHours(windows: readonly TimeWindow[]): DayHours {
  return { dayOfWeek: THURSDAY, windows };
}

function fixedHoliday(date: string): HolidayOccurrence {
  return { id: 'hol_00000000000000000000000001' as HolidayId, name: { fr: 'Férié', ar: 'عيد' }, kind: 'fixed', startDate: date, endDate: date };
}

function context(
  over: Partial<Omit<SessionAuditContext, 'roomScheduleIndex' | 'teacherScheduleIndex'>> & {
    liveSchedule?: readonly SessionOccurrenceView[];
  } = {},
): SessionAuditContext {
  const { liveSchedule = [], ...rest } = over;
  const { byDateRoom, byDateTeacher } = buildResourceScheduleIndex(liveSchedule);
  return {
    holidays: [],
    overrides: [],
    staticDayByWeekday: new Map(),
    availabilityByTeacher: new Map(),
    roomScheduleIndex: byDateRoom,
    teacherScheduleIndex: byDateTeacher,
    enrollmentByGroup: new Map(),
    ...rest,
  };
}

describe('auditReasonsFor', () => {
  it('returns no reasons when the occurrence still fits', () => {
    expect(auditReasonsFor(occurrence(), context())).toEqual([]);
  });

  it('flags on-holiday when a holiday covers the date', () => {
    const session = occurrence({ date: '2026-01-08' });
    expect(
      auditReasonsFor(session, context({ holidays: [fixedHoliday('2026-01-08')] })),
    ).toEqual(['on-holiday']);
  });

  it('flags outside-center-hours when the slot no longer fits the static day', () => {
    const session = occurrence({ date: '2026-01-08', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
    const staticDayByWeekday = new Map<WeekdayIndex, DayHours>([
      [THURSDAY, dayHours([{ open: '09:00' as TimeOfDay, close: '12:00' as TimeOfDay }])],
    ]);
    expect(auditReasonsFor(session, context({ staticDayByWeekday }))).toEqual(['outside-center-hours']);
  });

  it('flags outside-teacher-availability when the teacher is off that weekday', () => {
    const session = occurrence({ teacherId: TEACHER });
    const availabilityByTeacher = new Map([[TEACHER, { weeklyWindows: weekWindows({}), exceptions: [] }]]);
    expect(auditReasonsFor(session, context({ availabilityByTeacher }))).toEqual([
      'outside-teacher-availability',
    ]);
  });

  it('flags room-archived when the room is tombstoned', () => {
    expect(auditReasonsFor(occurrence({ roomArchived: true }), context())).toEqual(['room-archived']);
  });

  it('flags room-over-capacity when live enrollment exceeds the room seats', () => {
    const session = occurrence({ roomCapacity: 5 });
    const enrollmentByGroup = new Map<GroupId, number>([[GROUP, 8]]);
    expect(auditReasonsFor(session, context({ enrollmentByGroup }))).toEqual(['room-over-capacity']);
  });

  it('does not flag room-over-capacity at exactly capacity', () => {
    const session = occurrence({ roomCapacity: 8 });
    const enrollmentByGroup = new Map<GroupId, number>([[GROUP, 8]]);
    expect(auditReasonsFor(session, context({ enrollmentByGroup }))).toEqual([]);
  });

  it('skips room-over-capacity when the room is archived', () => {
    const session = occurrence({ roomArchived: true, roomCapacity: 5 });
    const enrollmentByGroup = new Map<GroupId, number>([[GROUP, 8]]);
    expect(auditReasonsFor(session, context({ enrollmentByGroup }))).toEqual(['room-archived']);
  });

  it('flags room-double-booked for a same-date, same-room overlap', () => {
    const session = occurrence({ date: '2026-01-08', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const other = occurrence({ date: '2026-01-08', start: '10:00' as TimeOfDay, end: '11:00' as TimeOfDay });
    expect(auditReasonsFor(session, context({ liveSchedule: [other] }))).toEqual(['room-double-booked']);
  });

  it('does not flag room-double-booked across different dates of the same weekday', () => {
    const session = occurrence({ date: '2026-01-08' });
    const other = occurrence({ date: '2026-01-15' });
    expect(auditReasonsFor(session, context({ liveSchedule: [other] }))).toEqual([]);
  });

  it('does not flag room-double-booked for a back-to-back (touching) slot', () => {
    const session = occurrence({ date: '2026-01-08', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const other = occurrence({ date: '2026-01-08', start: '10:30' as TimeOfDay, end: '11:00' as TimeOfDay });
    expect(auditReasonsFor(session, context({ liveSchedule: [other] }))).toEqual([]);
  });

  it('flags teacher-double-booked for a same-date, same-teacher overlap', () => {
    const session = occurrence({ teacherId: TEACHER, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const other = occurrence({ teacherId: TEACHER, roomId: OTHER_ROOM, start: '10:00' as TimeOfDay, end: '11:00' as TimeOfDay });
    expect(auditReasonsFor(session, context({ liveSchedule: [other] }))).toEqual(['teacher-double-booked']);
  });

  it('does not flag teacher-double-booked for a different teacher', () => {
    const session = occurrence({ teacherId: TEACHER });
    const other = occurrence({ teacherId: OTHER_TEACHER, roomId: OTHER_ROOM, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    expect(auditReasonsFor(session, context({ liveSchedule: [other] }))).toEqual([]);
  });

  it('gathers every reason that applies at once (no precedence)', () => {
    const session = occurrence({
      teacherId: TEACHER,
      roomCapacity: 5,
      start: '09:00' as TimeOfDay,
      end: '10:30' as TimeOfDay,
    });
    const other = occurrence({ teacherId: TEACHER, start: '09:30' as TimeOfDay, end: '11:00' as TimeOfDay });
    const enrollmentByGroup = new Map<GroupId, number>([[GROUP, 8]]);
    const availabilityByTeacher = new Map([[TEACHER, { weeklyWindows: weekWindows({}), exceptions: [] }]]);
    expect(
      auditReasonsFor(session, context({ liveSchedule: [other], enrollmentByGroup, availabilityByTeacher })),
    ).toEqual(['outside-teacher-availability', 'room-over-capacity', 'room-double-booked', 'teacher-double-booked']);
  });
});
