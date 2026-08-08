import type { PlannerSessionView } from '../../../src/renderer/lib/planning/planner-view';
import type { CenterHoursWeek } from '../../../src/renderer/lib/center-hours';

let seq = 0;

/** One weekday's opening hours row, as `centerHours.get` returns it. */
export function hoursRow(
  dayOfWeek: number,
  open: string | null,
  close: string | null,
): CenterHoursWeek[number] {
  return { dayOfWeek, open, close };
}

/** Build a `PlannerSessionView` with sane defaults; override only what a test cares about. */
export function session(overrides: Partial<PlannerSessionView> = {}): PlannerSessionView {
  seq += 1;
  return {
    id: `s${seq}`,
    dayOfWeek: 1,
    start: '09:00',
    end: '10:00',
    roomId: 'r1',
    roomName: 'Salle 1',
    teacherId: 't1',
    teacherName: { fr: 'Prof A', ar: 'أستاذ أ' },
    groupId: 'g1',
    subjectId: 'math',
    subjectName: { fr: 'Maths', ar: 'رياضيات' },
    level: '1BAC',
    kind: 'regular',
    ...overrides,
  };
}
