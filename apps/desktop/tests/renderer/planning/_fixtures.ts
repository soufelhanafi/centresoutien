import type { WeekdayIndex } from '@centresoutien/domain';
import type { PlannerSessionView } from '../../../src/renderer/lib/planning/planner-view';

let seq = 0;

/** Build a `PlannerSessionView` with sane defaults; override only what a test cares about. */
export function session(overrides: Partial<PlannerSessionView> = {}): PlannerSessionView {
  seq += 1;
  return {
    id: `s${seq}`,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00',
    end: '10:00',
    roomId: 'r1',
    roomName: 'Salle 1',
    teacherId: 't1',
    teacherName: 'Prof A',
    subjectId: 'math',
    subjectName: { fr: 'Maths', ar: 'رياضيات' },
    level: '1BAC',
    kind: 'regular',
    ...overrides,
  };
}
