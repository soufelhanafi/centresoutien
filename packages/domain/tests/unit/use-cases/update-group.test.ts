import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateGroup, type UpdateGroupInput } from '../../../src/use-cases/update-group';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { RoomNotFoundError } from '../../../src/errors/room-errors';
import {
  GroupNotFoundError,
  GroupOverCapacityError,
  GroupSubjectUnavailableError,
} from '../../../src/errors/group-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Room, RoomId } from '../../../src/entities/room';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const GROUP_ID = 'grp_00000000000000000000000001' as GroupId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const ROOM_ID = 'rom_00000000000000000000000001' as RoomId;

const envelopeClock = fakeClock('2026-07-29T10:00:00Z');

function seededGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    subjectId: SUBJECT_ID,
    teacherId: null,
    roomId: ROOM_ID,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: ROOM_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: 'Salle A',
    capacity: 20,
    active: true,
    ...overrides,
  };
}

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: SUBJECT_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: { fr: 'Maths', ar: 'الرياضيات' },
    active: true,
    ...overrides,
  };
}

function validInput(overrides: Partial<UpdateGroupInput> = {}): UpdateGroupInput {
  return {
    id: GROUP_ID,
    subjectId: SUBJECT_ID,
    teacherId: null,
    roomId: ROOM_ID,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    centerCode: CENTER,
    updatedBy: EDITOR,
    ...overrides,
  };
}

describe('UpdateGroup', () => {
  let groups: InMemoryGroupRepository;
  let rooms: InMemoryRoomRepository;
  let subjects: InMemorySubjectRepository;

  function build(plan: Plan = PLANS.pro): UpdateGroup {
    return new UpdateGroup(
      groups,
      rooms,
      subjects,
      fakeClock('2026-07-30T09:00:00Z'),
      new PlanPolicy(plan),
    );
  }

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    rooms = new InMemoryRoomRepository();
    subjects = new InMemorySubjectRepository();
    await groups.save(seededGroup());
    await rooms.save(makeRoom());
    await subjects.save(makeSubject());
  });

  describe('happy path', () => {
    it('edits fields, bumping updatedAt/updatedBy but not identity or version', async () => {
      const updated = await build().execute(
        validInput({ level: '  1ère Bac ', capacity: 18, teacherId: 'tch_00000000000000000000000009' }),
      );

      expect(updated.level).toBe('1ère Bac'); // trimmed by the schema
      expect(updated.capacity).toBe(18);
      expect(updated.teacherId).toBe('tch_00000000000000000000000009');
      expect(updated.updatedAt).toEqual(new Date('2026-07-30T09:00:00Z'));
      expect(updated.updatedBy).toBe(EDITOR);
      // Identity + provenance preserved; version stays the hub's to assign.
      expect(updated.id).toBe(GROUP_ID);
      expect(updated.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(updated.deviceOrigin).toBe(DEVICE);
      expect(updated.version).toBe(0);
      expect(await groups.findById(GROUP_ID)).toEqual(updated);
    });

    it('is a no-op when nothing changed — updatedAt is not bumped, no spurious delta', async () => {
      const before = await groups.findById(GROUP_ID);
      const result = await build().execute(validInput());

      expect(result).toEqual(before);
      expect(result.updatedBy).toBe(USER); // unchanged — not the editor
      expect(result.updatedAt).toEqual(new Date('2026-07-29T10:00:00Z'));
    });

    it('accepts capacity exactly equal to the room capacity', async () => {
      const updated = await build().execute(validInput({ capacity: 20 }));
      expect(updated.capacity).toBe(20);
    });
  });

  describe('exam-prep gating', () => {
    it('switches a group to exam-prep on Pro', async () => {
      const updated = await build(PLANS.pro).execute(validInput({ kind: 'exam-prep' }));
      expect(updated.kind).toBe('exam-prep');
    });

    it('rejects switching to exam-prep when the plan lacks core.exam-prep and leaves the row untouched', async () => {
      await expect(
        build(planWithoutFeature('core.exam-prep')).execute(validInput({ kind: 'exam-prep' })),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect((await groups.findById(GROUP_ID))?.kind).toBe('regular');
    });
  });

  describe('capacity invariant', () => {
    it('rejects capacity above the room capacity with GroupOverCapacityError', async () => {
      await expect(build().execute(validInput({ capacity: 21 }))).rejects.toBeInstanceOf(
        GroupOverCapacityError,
      );
      expect((await groups.findById(GROUP_ID))?.capacity).toBe(15);
    });

    it('rejects a capacity below 1 (schema invariant)', async () => {
      await expect(build().execute(validInput({ capacity: 0 }))).rejects.toThrow();
      expect((await groups.findById(GROUP_ID))?.capacity).toBe(15);
    });
  });

  describe('room resolution', () => {
    it('rejects an unknown room with RoomNotFoundError', async () => {
      await expect(
        build().execute(validInput({ roomId: 'rom_00000000000000000000000099' as RoomId })),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
    });

    it('rejects re-pointing at a room in another center (tenant scoping)', async () => {
      const otherRoomId = 'rom_00000000000000000000000003' as RoomId;
      await rooms.save(makeRoom({ id: otherRoomId, centerCode: OTHER_CENTER }));
      await expect(build().execute(validInput({ roomId: otherRoomId }))).rejects.toBeInstanceOf(
        RoomNotFoundError,
      );
    });

    it('rejects re-pointing at an archived (tombstoned) room', async () => {
      await rooms.softDelete(ROOM_ID, new Date('2026-07-30T00:00:00Z'), USER);
      await expect(build().execute(validInput())).rejects.toBeInstanceOf(RoomNotFoundError);
    });
  });

  describe('subject resolution', () => {
    it('rejects an inactive subject as inactive', async () => {
      await subjects.save(makeSubject({ active: false }));
      const error = await build().execute(validInput()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GroupSubjectUnavailableError);
      expect((error as GroupSubjectUnavailableError).reason).toBe('inactive');
    });

    it('rejects re-pointing at a subject in another center as not-found (tenant scoping)', async () => {
      const otherSubjectId = 'sub_00000000000000000000000003' as SubjectId;
      await subjects.save(makeSubject({ id: otherSubjectId, centerCode: OTHER_CENTER }));
      const error = await build()
        .execute(validInput({ subjectId: otherSubjectId }))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GroupSubjectUnavailableError);
      expect((error as GroupSubjectUnavailableError).reason).toBe('not-found');
    });
  });

  describe('not found / tenant scoping', () => {
    it('throws GroupNotFoundError for an unknown id', async () => {
      await expect(
        build().execute(validInput({ id: 'grp_00000000000000000000000099' as GroupId })),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });

    it('throws GroupNotFoundError for a group in another center (no cross-tenant edit)', async () => {
      await expect(
        build().execute(validInput({ centerCode: OTHER_CENTER })),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
      expect((await groups.findById(GROUP_ID))?.level).toBe('2ème Bac');
    });

    it('does not resurrect an archived group (findById hides tombstones)', async () => {
      await groups.softDelete(GROUP_ID, new Date('2026-07-30T00:00:00Z'), USER);
      await expect(build().execute(validInput())).rejects.toBeInstanceOf(GroupNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
