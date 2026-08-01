import { describe, it, expect, beforeEach } from 'vitest';
import { ListWeekSessions } from '../../../src/use-cases/list-week-sessions';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { WeeklySessionView } from '../../../src/read-models/weekly-session-view';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { SubjectId } from '../../../src/entities/subject';
import type { GroupId } from '../../../src/entities/group';
import type { CenterCode, EntityId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemoryWeeklySessionViewReadPort } from '../fakes/in-memory-weekly-session-view-read-port';

const CENTER = 'CS-CASA-001' as CenterCode;
const ROOM = 'rom_00000000000000000000000001' as RoomId;

let seq = 0;
function view(over: Partial<WeeklySessionView> = {}): WeeklySessionView {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:00' as TimeOfDay,
    roomId: ROOM,
    roomName: 'Salle 1',
    teacherId: 'tch_00000000000000000000000001' as EntityId,
    teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
    groupId: 'grp_00000000000000000000000001' as GroupId,
    subjectId: 'sub_00000000000000000000000001' as SubjectId,
    subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
    level: '2 Bac SM',
    kind: 'regular',
    ...over,
  };
}

describe('ListWeekSessions', () => {
  let reads: InMemoryWeeklySessionViewReadPort;
  let useCase: ListWeekSessions;

  beforeEach(() => {
    reads = new InMemoryWeeklySessionViewReadPort();
    useCase = new ListWeekSessions(reads, new PlanPolicy(PLANS.essentiel));
  });

  it('returns the center week the read port yields, untouched and in order', async () => {
    const week = [
      view({ dayOfWeek: 1 as WeekdayIndex, start: '09:00' as TimeOfDay }),
      view({ dayOfWeek: 1 as WeekdayIndex, start: '14:00' as TimeOfDay }),
      view({ dayOfWeek: 3 as WeekdayIndex, start: '10:00' as TimeOfDay }),
    ];
    reads.seed(CENTER, week);

    const result = await useCase.execute({ centerCode: CENTER });
    expect(result).toEqual(week);
  });

  it('passes through the neutral fallback for a session with no live group', async () => {
    const orphan = view({
      groupId: null,
      subjectId: null,
      subjectName: null,
      level: null,
      kind: 'regular',
      teacherId: null,
      teacherName: null,
    });
    reads.seed(CENTER, [orphan]);

    const [only] = await useCase.execute({ centerCode: CENTER });
    expect(only).toMatchObject({ groupId: null, subjectName: null, level: null, kind: 'regular' });
  });

  it('returns an empty week for a center with no sessions', async () => {
    await expect(useCase.execute({ centerCode: CENTER })).resolves.toEqual([]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListWeekSessions(reads, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
