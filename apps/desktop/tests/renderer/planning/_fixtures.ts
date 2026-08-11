import type { PlannerSessionView } from '../../../src/renderer/lib/planning/planner-view';
import type { CenterHoursWeek } from '../../../src/renderer/lib/center-hours';

let seq = 0;

/** One weekday's opening-hours row, as `centerHours.get` returns it. A null
 *  open or close collapses to a closed day (no windows). */
export function hoursRow(
  dayOfWeek: number,
  open: string | null,
  close: string | null,
): CenterHoursWeek[number] {
  if (open === null || close === null) return { dayOfWeek, windows: [] };
  return { dayOfWeek, windows: [{ open, close }] };
}

/** A weekday row with an explicit window list (e.g. a mid-day break). */
export function windowsRow(
  dayOfWeek: number,
  windows: readonly { open: string; close: string }[],
): CenterHoursWeek[number] {
  return { dayOfWeek, windows: windows.map((window) => ({ ...window })) };
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
