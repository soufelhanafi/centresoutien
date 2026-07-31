import { describe, it, expect, beforeEach } from 'vitest';
import { ListWeekSessions } from '../../../src/use-cases/list-week-sessions';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;

let seq = 0;
function seededSession(
  dayOfWeek: WeekdayIndex,
  start: string,
  end: string,
  centerCode: CenterCode = CENTER,
): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    roomId: ROOM,
    teacherId: null,
    dayOfWeek,
    start: start as TimeOfDay,
    end: end as TimeOfDay,
  };
}

describe('ListWeekSessions', () => {
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let useCase: ListWeekSessions;

  beforeEach(() => {
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    useCase = new ListWeekSessions(sessions, new PlanPolicy(PLANS.essentiel));
  });

  it('returns the center week ordered by weekday then start time', async () => {
    await sessions.save(seededSession(3, '10:00', '11:00'));
    await sessions.save(seededSession(1, '14:00', '15:00'));
    await sessions.save(seededSession(1, '09:00', '10:00'));

    const week = await useCase.execute({ centerCode: CENTER });
    expect(week.map((s) => [s.dayOfWeek, s.start])).toEqual([
      [1, '09:00'],
      [1, '14:00'],
      [3, '10:00'],
    ]);
  });

  it('excludes tombstoned sessions and other centers', async () => {
    await sessions.save(seededSession(2, '09:00', '10:00'));
    const gone = seededSession(2, '11:00', '12:00');
    await sessions.save(gone);
    await sessions.softDelete(gone.id, new Date('2026-07-30T00:00:00Z'), USER);
    await sessions.save(seededSession(2, '08:00', '09:00', OTHER_CENTER));

    const week = await useCase.execute({ centerCode: CENTER });
    expect(week.map((s) => s.start)).toEqual(['09:00']);
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
    useCase = new ListWeekSessions(sessions, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
