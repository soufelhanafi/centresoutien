import { describe, it, expect, beforeEach } from 'vitest';
import { ListGroups } from '../../../src/use-cases/list-groups';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const ROOM_ID = 'rom_00000000000000000000000001' as RoomId;

const envelopeClock = fakeClock('2026-07-29T10:00:00Z');

let seq = 0;
function makeGroup(overrides: Partial<Group> = {}): Group {
  seq += 1;
  return {
    id: `grp_${String(seq).padStart(26, '0')}` as GroupId,
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

describe('ListGroups', () => {
  let groups: InMemoryGroupRepository;
  let useCase: ListGroups;

  beforeEach(() => {
    groups = new InMemoryGroupRepository();
    useCase = new ListGroups(groups, new PlanPolicy(PLANS.essentiel));
  });

  describe('active scope', () => {
    it('returns only live groups of the center, ordered by level then id, excluding tombstones + other centers', async () => {
      await groups.save(makeGroup({ level: 'Tronc Commun' }));
      const first = makeGroup({ level: '1ère Bac' });
      await groups.save(first);
      const gone = makeGroup({ level: '2ème Bac' });
      await groups.save(gone);
      await groups.softDelete(gone.id, new Date('2026-07-30T00:00:00Z'), USER);
      await groups.save(makeGroup({ level: '1ère Bac', centerCode: OTHER_CENTER }));

      const active = await useCase.execute({ centerCode: CENTER, scope: 'active' });
      expect(active.map((g) => g.level)).toEqual(['1ère Bac', 'Tronc Commun']);
      expect(active.map((g) => g.id)).toEqual([first.id, expect.any(String)]);
    });

    it('breaks a level tie deterministically by id (creation order)', async () => {
      const a = makeGroup({ level: '2ème Bac' });
      const b = makeGroup({ level: '2ème Bac' });
      // Save b before a — ordering must still come from the id, not insertion.
      await groups.save(b);
      await groups.save(a);
      const active = await useCase.execute({ centerCode: CENTER, scope: 'active' });
      const ids = active.map((g) => g.id);
      expect(ids).toEqual([...ids].sort((x, y) => x.localeCompare(y)));
    });
  });

  describe('archived scope', () => {
    it('returns only tombstoned groups of the center', async () => {
      await groups.save(makeGroup({ level: 'Live' }));
      const archived = makeGroup({ level: 'Archived' });
      await groups.save(archived);
      await groups.softDelete(archived.id, new Date('2026-07-30T00:00:00Z'), USER);

      const result = await useCase.execute({ centerCode: CENTER, scope: 'archived' });
      expect(result.map((g) => g.id)).toEqual([archived.id]);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new ListGroups(groups, new PlanPolicy(planWithout));
      await expect(useCase.execute({ centerCode: CENTER, scope: 'active' })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
