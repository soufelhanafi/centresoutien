import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommitGeneratedSchedule,
  type CommitGeneratedScheduleInput,
  type CommitGroupProposal,
} from '../../../src/use-cases/commit-generated-schedule';
import { GeneratedScheduleSeatFitGuard } from '../../../src/services/generated-schedule-seat-fit-guard';
import { CreateWeeklyRecurringSession } from '../../../src/use-cases/create-weekly-recurring-session';
import { GenerateAndPersistSessions } from '../../../src/use-cases/generate-and-persist-sessions';
import { GenerateSessions } from '../../../src/use-cases/generate-sessions';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { GroupNotFoundError } from '../../../src/errors/group-errors';
import { GeneratedScheduleCapacityConflictError } from '../../../src/errors/session-generator-errors';
import { RoomConflictError } from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { Room, RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemorySessionRepository } from '../fakes/in-memory-session-repository';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;
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
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...overrides,
  };
}

function makeRoom(id: RoomId, overrides: Partial<Room> = {}): Room {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: 'Salle',
    capacity: 30,
    active: true,
    ...overrides,
  };
}

function proposal(groupId: GroupId, blocks: CommitGroupProposal['blocks']): CommitGroupProposal {
  return { groupId, blocks };
}

function block(
  dayOfWeek: WeekdayIndex,
  start: string,
  end: string,
  roomId: RoomId = ROOM_A,
  allowScheduleConflict = false,
): CommitGroupProposal['blocks'][number] {
  return {
    block: { dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay },
    roomId,
    allowScheduleConflict,
  };
}

describe('CommitGeneratedSchedule', () => {
  let groups: InMemoryGroupRepository;
  let rooms: InMemoryRoomRepository;
  let recurrences: InMemoryWeeklyRecurringSessionRepository;
  let centerHoursRepo: InMemoryCenterHoursRepository;
  let concreteSessions: InMemorySessionRepository;
  let holidays: InMemoryHolidayRepository;
  let centerHoursOverrides: InMemoryCenterHoursOverrideRepository;
  let useCase: CommitGeneratedSchedule;

  function build(plan: Plan = PLANS.premium, seed = 1): CommitGeneratedSchedule {
    const clock = fakeClock('2026-08-01T00:00:00Z');
    const ids = fakeIds(seed);
    const policy = new PlanPolicy(plan);
    const createWeeklySession = new CreateWeeklyRecurringSession(
      recurrences,
      groups,
      rooms,
      centerHoursRepo,
      centerHoursOverrides,
      clock,
      ids,
      policy,
    );
    const generateAndPersist = new GenerateAndPersistSessions(
      concreteSessions,
      recurrences,
      holidays,
      centerHoursOverrides,
      new GenerateSessions(clock, ids),
      policy,
    );
    return new CommitGeneratedSchedule(
      groups,
      new GeneratedScheduleSeatFitGuard(groups, rooms),
      createWeeklySession,
      generateAndPersist,
      policy,
    );
  }

  function input(overrides: Partial<CommitGeneratedScheduleInput> = {}): CommitGeneratedScheduleInput {
    return {
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
      mode: 'custom',
      proposals: [],
      range: { startDate: '2026-09-01', endDate: '2026-09-30' },
      ...overrides,
    };
  }

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    rooms = new InMemoryRoomRepository();
    await rooms.save(makeRoom(ROOM_A));
    await rooms.save(makeRoom(ROOM_B));
    recurrences = new InMemoryWeeklyRecurringSessionRepository();
    centerHoursRepo = new InMemoryCenterHoursRepository();
    concreteSessions = new InMemorySessionRepository();
    holidays = new InMemoryHolidayRepository();
    centerHoursOverrides = new InMemoryCenterHoursOverrideRepository();
    useCase = build();
  });

  describe('happy path', () => {
    it('persists one WeeklyRecurringSession per block and materializes dated occurrences', async () => {
      const group = makeGroup();
      await groups.save(group);

      const result = await useCase.execute(
        input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] }),
      );

      expect(result.templates).toHaveLength(1);
      const template = result.templates[0]!;
      expect(template.groupId).toBe(group.id);
      expect(template.generationBatchId).toMatch(/^gen_/);

      const stored = await recurrences.findById(template.recurringSessionId);
      expect(stored).not.toBeNull();
      expect(stored?.roomId).toBe(ROOM_A);
      expect(stored?.dayOfWeek).toBe(MON);

      const persisted = await concreteSessions.listForRange(CENTER, { start: '2026-09-01', end: '2026-09-30' });
      expect(persisted.length).toBeGreaterThan(0);
      expect(persisted.every((s) => s.recurringSessionId === template.recurringSessionId)).toBe(true);
    });

    it('carries the group\'s live teacherId onto the created template, never trusting the proposal', async () => {
      const group = makeGroup({ teacherId: TEACHER });
      await groups.save(group);

      const result = await useCase.execute(
        input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] }),
      );

      const stored = await recurrences.findById(result.templates[0]!.recurringSessionId);
      expect(stored?.teacherId).toBe(TEACHER);
    });

    it('commits every block of a multi-weekday proposal as its own template', async () => {
      const group = makeGroup();
      await groups.save(group);

      const result = await useCase.execute(
        input({
          proposals: [
            proposal(group.id, [block(MON, '09:00', '10:30'), block(WED, '09:00', '10:30', ROOM_B)]),
          ],
        }),
      );

      expect(result.templates).toHaveLength(2);
      expect(result.templates.every((t) => t.groupId === group.id)).toBe(true);
      expect(new Set(result.templates.map((t) => t.recurringSessionId)).size).toBe(2);
    });

    it('commits templates from every proposal in the batch', async () => {
      const g1 = makeGroup();
      const g2 = makeGroup();
      await groups.save(g1);
      await groups.save(g2);

      const result = await useCase.execute(
        input({
          proposals: [
            proposal(g1.id, [block(MON, '09:00', '10:30', ROOM_A)]),
            proposal(g2.id, [block(WED, '09:00', '10:30', ROOM_B)]),
          ],
        }),
      );

      expect(result.templates.map((t) => t.groupId).sort()).toEqual([g1.id, g2.id].sort());
    });

    it('resolves an occurrenceCount range independently per template weekday', async () => {
      const g1 = makeGroup();
      const g2 = makeGroup();
      await groups.save(g1);
      await groups.save(g2);

      // 2026-09-01 is a Tuesday. First Monday on/after it is 2026-09-07; first
      // Wednesday on/after it is 2026-09-02 — 3 occurrences land on different
      // end dates for the same start date and count.
      const result = await useCase.execute(
        input({
          range: { startDate: '2026-09-01', occurrenceCount: 3 },
          proposals: [
            proposal(g1.id, [block(MON, '09:00', '10:30', ROOM_A)]),
            proposal(g2.id, [block(WED, '09:00', '10:30', ROOM_B)]),
          ],
        }),
      );

      const monTemplate = result.templates.find((t) => t.groupId === g1.id)!;
      const wedTemplate = result.templates.find((t) => t.groupId === g2.id)!;
      const monDates = (await concreteSessions.listForRange(CENTER, { start: '2026-09-01', end: '2026-12-31' }))
        .filter((s) => s.recurringSessionId === monTemplate.recurringSessionId)
        .map((s) => s.date);
      const wedDates = (await concreteSessions.listForRange(CENTER, { start: '2026-09-01', end: '2026-12-31' }))
        .filter((s) => s.recurringSessionId === wedTemplate.recurringSessionId)
        .map((s) => s.date);

      expect(monDates).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
      expect(wedDates).toEqual(['2026-09-02', '2026-09-09', '2026-09-16']);
    });
  });

  describe('conflict re-check at write time', () => {
    it('rejects a block that clashes with an already-committed session', async () => {
      const group = makeGroup();
      await groups.save(group);
      const clashing = new CreateWeeklyRecurringSession(
        recurrences,
        groups,
        rooms,
        centerHoursRepo,
        centerHoursOverrides,
        fakeClock('2026-07-01T00:00:00Z'),
        fakeIds(900),
        new PlanPolicy(PLANS.essentiel),
      );
      await clashing.execute({
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
        roomId: ROOM_A,
        teacherId: null,
        groupId: null,
        dayOfWeek: MON,
        start: '09:00' as TimeOfDay,
        end: '10:30' as TimeOfDay,
        active: true,
        validFrom: null,
        validTo: null,
      });

      await expect(
        useCase.execute(input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] })),
      ).rejects.toBeInstanceOf(RoomConflictError);
    });

    it('leaves already-committed blocks in place when a later block in the same run conflicts', async () => {
      const group = makeGroup();
      await groups.save(group);

      await expect(
        useCase.execute(
          input({
            proposals: [
              proposal(group.id, [
                block(MON, '09:00', '10:30', ROOM_A),
                block(MON, '09:00', '10:30', ROOM_A), // same room+day+time as the block above
              ]),
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(RoomConflictError);

      const live = (await recurrences.listRefsForDay(CENTER, MON)).filter((r) => r.roomId === ROOM_A);
      expect(live).toHaveLength(1);
    });
  });

  describe('per-block force / exclude (SOU-183)', () => {
    async function seedClashingMondaySlot(): Promise<void> {
      const clashing = new CreateWeeklyRecurringSession(
        recurrences,
        groups,
        rooms,
        centerHoursRepo,
        centerHoursOverrides,
        fakeClock('2026-07-01T00:00:00Z'),
        fakeIds(900),
        new PlanPolicy(PLANS.essentiel),
      );
      await clashing.execute({
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
        roomId: ROOM_A,
        teacherId: null,
        groupId: null,
        dayOfWeek: MON,
        start: '09:00' as TimeOfDay,
        end: '10:30' as TimeOfDay,
        active: true,
        validFrom: null,
        validTo: null,
      });
    }

    it('commits both a clean block and a forced clashing block, marking only the forced one', async () => {
      const group = makeGroup();
      await groups.save(group);
      await seedClashingMondaySlot();

      const result = await useCase.execute(
        input({
          proposals: [
            proposal(group.id, [
              block(MON, '09:00', '10:30', ROOM_A, true), // clashes with the seeded slot → forced
              block(WED, '09:00', '10:30', ROOM_B, false), // clean
            ]),
          ],
        }),
      );

      expect(result.templates).toHaveLength(2);
      const stored = await Promise.all(
        result.templates.map((t) => recurrences.findById(t.recurringSessionId)),
      );
      const monday = stored.find((s) => s?.dayOfWeek === MON)!;
      const wednesday = stored.find((s) => s?.dayOfWeek === WED)!;
      expect(monday.conflictAccepted).toBe(true);
      expect(wednesday.conflictAccepted).toBe(false);
    });

    it('does not commit an excluded block: only the blocks present in the list are persisted', async () => {
      const group = makeGroup();
      await groups.save(group);

      const result = await useCase.execute(
        input({
          proposals: [proposal(group.id, [block(WED, '09:00', '10:30', ROOM_B)])],
        }),
      );

      expect(result.templates).toHaveLength(1);
      expect(await recurrences.listRefsForDay(CENTER, MON)).toEqual([]);
      const wednesday = await recurrences.listRefsForDay(CENTER, WED);
      expect(wednesday).toHaveLength(1);
    });

    it('a non-forced block that clashes still aborts the run (force is opt-in per block)', async () => {
      const group = makeGroup();
      await groups.save(group);
      await seedClashingMondaySlot();

      await expect(
        useCase.execute(
          input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30', ROOM_A, false)])] }),
        ),
      ).rejects.toBeInstanceOf(RoomConflictError);
    });
  });

  describe('capacity conflict rejection (SOU-275)', () => {
    it('rejects the whole batch when a block\'s assigned room cannot seat its group, persisting nothing', async () => {
      const group = makeGroup({ capacity: 40 }); // larger than either 30-seat room
      await groups.save(group);

      await expect(
        useCase.execute(input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30', ROOM_A)])] })),
      ).rejects.toBeInstanceOf(GeneratedScheduleCapacityConflictError);

      expect(await recurrences.listRefsForDay(CENTER, MON)).toEqual([]);
    });

    it('rejects even when the offending block is forced (capacity overflow is non-forceable)', async () => {
      const group = makeGroup({ capacity: 40 });
      await groups.save(group);

      await expect(
        useCase.execute(
          input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30', ROOM_A, true)])] }),
        ),
      ).rejects.toBeInstanceOf(GeneratedScheduleCapacityConflictError);
    });

    it('rejects the whole batch before committing any block when only a later proposal overflows', async () => {
      const fitting = makeGroup({ capacity: 15 });
      const overflowing = makeGroup({ capacity: 40 });
      await groups.save(fitting);
      await groups.save(overflowing);

      await expect(
        useCase.execute(
          input({
            proposals: [
              proposal(fitting.id, [block(MON, '09:00', '10:30', ROOM_A)]),
              proposal(overflowing.id, [block(WED, '09:00', '10:30', ROOM_B)]),
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(GeneratedScheduleCapacityConflictError);

      expect(await recurrences.listRefsForDay(CENTER, MON)).toEqual([]);
      expect(await recurrences.listRefsForDay(CENTER, WED)).toEqual([]);
    });

    it('attributes the offending group and room on the thrown error', async () => {
      const group = makeGroup({ capacity: 40 });
      await groups.save(group);

      try {
        await useCase.execute(input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30', ROOM_A)])] }));
        expect.unreachable('expected a capacity-conflict throw');
      } catch (error) {
        expect(error).toBeInstanceOf(GeneratedScheduleCapacityConflictError);
        const capacity = error as GeneratedScheduleCapacityConflictError;
        expect(capacity.code).toBe('schedule-capacity-conflict');
        expect(capacity.groupId).toBe(group.id);
        expect(capacity.roomId).toBe(ROOM_A);
        expect(capacity.groupCapacity).toBe(40);
        expect(capacity.roomCapacity).toBe(30);
      }
    });

    it('commits normally when every block\'s assigned room seats its group', async () => {
      const group = makeGroup({ capacity: 30 }); // exactly fills the 30-seat room
      await groups.save(group);

      const result = await useCase.execute(
        input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30', ROOM_A)])] }),
      );

      expect(result.templates).toHaveLength(1);
    });
  });

  describe('group resolution', () => {
    it('throws GroupNotFoundError when the group was deleted since the preview', async () => {
      const group = makeGroup();
      await groups.save(group);
      await groups.softDelete(group.id, new Date('2026-08-01T00:00:00Z'), USER);

      await expect(
        useCase.execute(input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] })),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });

    it('throws GroupNotFoundError for a group belonging to another center', async () => {
      const group = makeGroup({ centerCode: OTHER_CENTER });
      await groups.save(group);

      await expect(
        useCase.execute(input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] })),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError for custom mode when the plan lacks planning.custom-grid, persisting nothing', async () => {
      const group = makeGroup();
      await groups.save(group);

      await expect(
        build(planWithoutFeature('planning.custom-grid')).execute(
          input({ mode: 'custom', proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] }),
        ),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);

      expect(await recurrences.listRefsForDay(CENTER, MON)).toEqual([]);
    });

    it('throws PlanFeatureUnavailableError for auto mode when the plan lacks planning.random-auto, persisting nothing', async () => {
      const group = makeGroup();
      await groups.save(group);

      await expect(
        build(planWithoutFeature('planning.random-auto')).execute(
          input({ mode: 'auto', proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] }),
        ),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);

      expect(await recurrences.listRefsForDay(CENTER, MON)).toEqual([]);
    });

    it('allows custom mode on Pro (does not require planning.random-auto)', async () => {
      const group = makeGroup();
      await groups.save(group);

      await expect(
        build(PLANS.pro).execute(
          input({ mode: 'custom', proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] }),
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a plan with an empty feature set outright', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      const group = makeGroup();
      await groups.save(group);

      await expect(
        build(planWithout).execute(
          input({ proposals: [proposal(group.id, [block(MON, '09:00', '10:30')])] }),
        ),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);

      expect(await recurrences.listRefsForDay(CENTER, MON)).toEqual([]);
    });
  });
});
