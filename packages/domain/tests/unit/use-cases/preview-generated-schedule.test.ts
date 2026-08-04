import { describe, it, expect, beforeEach } from 'vitest';
import {
  PreviewGeneratedSchedule,
  type PreviewGeneratedScheduleInput,
} from '../../../src/use-cases/preview-generated-schedule';
import { SessionGenerator } from '../../../src/services/session-generator';
import type { SessionGeneratorConfig } from '../../../src/services/session-generator';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { RoomId } from '../../../src/entities/room';
import type { TeacherId } from '../../../src/entities/teacher';
import type { WeeklyRecurringSession, WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { fakeClock } from '../fakes/clock';
import { fakeRandom } from '../fakes/random';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER_1 = 'tch_00000000000000000000000001' as TeacherId;
const TEACHER_2 = 'tch_00000000000000000000000002' as TeacherId;
const MON = 1 as WeekdayIndex;
const WED = 3 as WeekdayIndex;

const envelopeClock = fakeClock('2026-07-29T10:00:00Z');

let groupSeq = 0;
function makeGroup(overrides: Partial<Group> = {}): Group {
  groupSeq += 1;
  return {
    id: `grp_${String(groupSeq).padStart(26, '0')}` as GroupId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    subjectId: SUBJECT_ID,
    teacherId: null,
    roomId: ROOM_A,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...overrides,
  };
}

function makeRoom(id: RoomId, overrides: Partial<{ centerCode: CenterCode }> = {}) {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: id,
    capacity: 20,
    active: true,
    ...overrides,
  };
}

let wrsSeq = 0;
function makeRecurring(overrides: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  wrsSeq += 1;
  return {
    id: `wrs_${String(wrsSeq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    roomId: ROOM_A,
    teacherId: null,
    groupId: null,
    dayOfWeek: MON,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function autoConfig(overrides: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular',
    weekdayPool: [MON, WED],
    sessionsPerWeek: 1,
    minGapDays: 1,
    sessionDurationMinutes: 90,
    range: { startDate: '2026-09-01', endDate: '2026-12-31' },
    mode: 'auto',
    ...overrides,
  } as SessionGeneratorConfig;
}

describe('PreviewGeneratedSchedule', () => {
  let groups: InMemoryGroupRepository;
  let rooms: InMemoryRoomRepository;
  let centerHours: InMemoryCenterHoursRepository;
  let recurrences: InMemoryWeeklyRecurringSessionRepository;
  let useCase: PreviewGeneratedSchedule;

  function build(plan: Plan = PLANS.essentiel): PreviewGeneratedSchedule {
    return new PreviewGeneratedSchedule(
      groups,
      rooms,
      centerHours,
      recurrences,
      new SessionGenerator(fakeRandom()),
      new PlanPolicy(plan),
    );
  }

  function input(config: SessionGeneratorConfig): PreviewGeneratedScheduleInput {
    return { centerCode: CENTER, config };
  }

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    rooms = new InMemoryRoomRepository();
    centerHours = new InMemoryCenterHoursRepository();
    recurrences = new InMemoryWeeklyRecurringSessionRepository();
    await rooms.save(makeRoom(ROOM_A));
    useCase = build();
  });

  describe('scope resolution', () => {
    it('resolves scope "all" to every live group of the matching kind', async () => {
      const g1 = makeGroup();
      const g2 = makeGroup();
      const examPrep = makeGroup({ kind: 'exam-prep' });
      await groups.save(g1);
      await groups.save(g2);
      await groups.save(examPrep);

      const result = await useCase.execute(input(autoConfig()));
      expect(result.proposals.map((p) => p.groupId).sort()).toEqual([g1.id, g2.id].sort());
    });

    it('excludes tombstoned groups', async () => {
      const g1 = makeGroup();
      const gone = makeGroup();
      await groups.save(g1);
      await groups.save(gone);
      await groups.softDelete(gone.id, new Date('2026-08-01T00:00:00Z'), USER);

      const result = await useCase.execute(input(autoConfig()));
      expect(result.proposals.map((p) => p.groupId)).toEqual([g1.id]);
    });

    it('narrows to explicit group ids when scope.groups is not "all"', async () => {
      const g1 = makeGroup();
      const g2 = makeGroup();
      await groups.save(g1);
      await groups.save(g2);

      const result = await useCase.execute(
        input(autoConfig({ scope: { groups: [g1.id], teachers: 'all' } })),
      );
      expect(result.proposals.map((p) => p.groupId)).toEqual([g1.id]);
    });

    it('narrows to groups staffed by the named teachers when scope.teachers is not "all"', async () => {
      const staffed = makeGroup({ teacherId: TEACHER_1 as unknown as EntityId });
      const otherTeacher = makeGroup({ teacherId: TEACHER_2 as unknown as EntityId });
      const unstaffed = makeGroup({ teacherId: null });
      await groups.save(staffed);
      await groups.save(otherTeacher);
      await groups.save(unstaffed);

      const result = await useCase.execute(
        input(autoConfig({ scope: { groups: 'all', teachers: [TEACHER_1] } })),
      );
      expect(result.proposals.map((p) => p.groupId)).toEqual([staffed.id]);
    });

    it('never mixes exam-prep groups into a regular-kind run, and vice versa', async () => {
      const regular = makeGroup({ kind: 'regular' });
      const examPrep = makeGroup({ kind: 'exam-prep' });
      await groups.save(regular);
      await groups.save(examPrep);

      const regularResult = await useCase.execute(input(autoConfig({ kind: 'regular' })));
      expect(regularResult.proposals.map((p) => p.groupId)).toEqual([regular.id]);

      const examPrepResult = await useCase.execute(input(autoConfig({ kind: 'exam-prep' })));
      expect(examPrepResult.proposals.map((p) => p.groupId)).toEqual([examPrep.id]);
    });
  });

  describe('room and hours resolution', () => {
    it('draws rooms from every live room of the center', async () => {
      await rooms.save(makeRoom(ROOM_B));
      const g1 = makeGroup();
      await groups.save(g1);

      const result = await useCase.execute(input(autoConfig()));
      const usedRooms = new Set(result.proposals[0]!.blocks.map((b) => b.roomId));
      expect([...usedRooms].every((id) => id === ROOM_A || id === ROOM_B)).toBe(true);
    });

    it('falls back to the default week (09:00–18:00 every day) when no CenterHours rows exist', async () => {
      const g1 = makeGroup();
      await groups.save(g1);

      const result = await useCase.execute(input(autoConfig()));
      expect(result.proposals[0]!.blocks.every((b) => b.block.start === '09:00')).toBe(true);
    });
  });

  describe('conflicts against the real schedule', () => {
    it('reports a room conflict against an already-committed session', async () => {
      const g1 = makeGroup();
      await groups.save(g1);
      await recurrences.save(
        makeRecurring({ roomId: ROOM_A, dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }),
      );

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));
      expect(result.conflicts.some((c) => c.kind === 'room')).toBe(true);
    });

    it('reports no conflict when the existing schedule sits on a weekday outside the pool', async () => {
      const g1 = makeGroup();
      await groups.save(g1);
      const OTHER_DAY = 5 as WeekdayIndex; // Friday, not in the pool below
      await recurrences.save(makeRecurring({ roomId: ROOM_A, dayOfWeek: OTHER_DAY }));

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(input(autoConfig()))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
