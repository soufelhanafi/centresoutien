import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratedScheduleSeatFitGuard } from '../../../src/services/generated-schedule-seat-fit-guard';
import { GeneratedScheduleCapacityConflictError } from '../../../src/errors/session-generator-errors';
import { GroupNotFoundError } from '../../../src/errors/group-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Room, RoomId } from '../../../src/entities/room';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { CommitGroupProposal } from '../../../src/use-cases/commit-generated-schedule';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const MISSING_ROOM = 'rom_00000000000000000000000009' as RoomId;
const MON = 1 as WeekdayIndex;

const envelopeClock = { now: () => new Date('2026-07-29T10:00:00Z') };

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

function makeRoom(id: RoomId, capacity: number): Room {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: 'Salle',
    capacity,
    active: true,
  };
}

function proposal(groupId: GroupId, roomId: RoomId): CommitGroupProposal {
  return {
    groupId,
    blocks: [
      {
        block: { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay },
        roomId,
        allowScheduleConflict: false,
      },
    ],
  };
}

describe('GeneratedScheduleSeatFitGuard', () => {
  let groups: InMemoryGroupRepository;
  let rooms: InMemoryRoomRepository;
  let guard: GeneratedScheduleSeatFitGuard;

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    rooms = new InMemoryRoomRepository();
    await rooms.save(makeRoom(ROOM_A, 30));
    await rooms.save(makeRoom(ROOM_B, 30));
    guard = new GeneratedScheduleSeatFitGuard(groups, rooms);
  });

  it.each([
    { name: 'group smaller than its room', capacity: 15 },
    { name: 'group exactly fills its room', capacity: 30 },
  ])('resolves when $name', async ({ capacity }) => {
    const group = makeGroup({ capacity });
    await groups.save(group);

    await expect(guard.assertEveryBlockFits(CENTER, [proposal(group.id, ROOM_A)])).resolves.toBeUndefined();
  });

  it('throws with the offending group/room capacities when a group outgrows its room', async () => {
    const group = makeGroup({ capacity: 40 });
    await groups.save(group);

    try {
      await guard.assertEveryBlockFits(CENTER, [proposal(group.id, ROOM_A)]);
      expect.unreachable('expected a capacity-conflict throw');
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedScheduleCapacityConflictError);
      const conflict = error as GeneratedScheduleCapacityConflictError;
      expect(conflict.code).toBe('schedule-capacity-conflict');
      expect(conflict.groupId).toBe(group.id);
      expect(conflict.roomId).toBe(ROOM_A);
      expect(conflict.groupCapacity).toBe(40);
      expect(conflict.roomCapacity).toBe(30);
    }
  });

  it('ignores a room missing since the preview (left to the commit not-found check)', async () => {
    const group = makeGroup({ capacity: 40 });
    await groups.save(group);

    await expect(
      guard.assertEveryBlockFits(CENTER, [proposal(group.id, MISSING_ROOM)]),
    ).resolves.toBeUndefined();
  });

  it('reports the first overflow across multiple proposals, before any commit', async () => {
    const fitting = makeGroup({ capacity: 15 });
    const overflowing = makeGroup({ capacity: 40 });
    await groups.save(fitting);
    await groups.save(overflowing);

    await expect(
      guard.assertEveryBlockFits(CENTER, [
        proposal(fitting.id, ROOM_A),
        proposal(overflowing.id, ROOM_B),
      ]),
    ).rejects.toBeInstanceOf(GeneratedScheduleCapacityConflictError);
  });

  it('rejects a group that belongs to another center as not-found', async () => {
    const foreign = makeGroup({ capacity: 15, centerCode: OTHER_CENTER });
    await groups.save(foreign);

    await expect(
      guard.assertEveryBlockFits(CENTER, [proposal(foreign.id, ROOM_A)]),
    ).rejects.toBeInstanceOf(GroupNotFoundError);
  });
});
