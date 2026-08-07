import { describe, it, expect, beforeEach } from 'vitest';
import { RestoreGroup } from '../../../src/use-cases/restore-group';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { GroupNotFoundError } from '../../../src/errors/group-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const RESTORER = 'usr_00000000000000000000000002' as UserId;
const GROUP_ID = 'grp_00000000000000000000000001' as GroupId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;

function seededGroup(): Group {
  return {
    id: GROUP_ID,
    ...newEnvelope(
      { centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER },
      fakeClock('2026-07-29T10:00:00Z'),
    ),
    subjectId: SUBJECT_ID,
    teacherId: null,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
  };
}

describe('RestoreGroup', () => {
  let groups: InMemoryGroupRepository;
  let useCase: RestoreGroup;

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    await groups.save(seededGroup());
    await groups.softDelete(GROUP_ID, new Date('2026-07-30T00:00:00Z'), USER);
    useCase = new RestoreGroup(groups, fakeClock('2026-07-31T09:00:00Z'), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('clears the tombstone and bumps updatedAt/updatedBy so the group is live again', async () => {
      const restored = await useCase.execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: RESTORER });

      expect(restored.deletedAt).toBeNull();
      expect(restored.updatedAt).toEqual(new Date('2026-07-31T09:00:00Z'));
      expect(restored.updatedBy).toBe(RESTORER);
      // Identity + provenance + version preserved.
      expect(restored.id).toBe(GROUP_ID);
      expect(restored.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(restored.version).toBe(0);
      // Now readable through the live path.
      expect(await groups.findById(GROUP_ID)).toEqual(restored);
    });
  });

  describe('not found', () => {
    it('throws GroupNotFoundError for a group that is already live (nothing to restore)', async () => {
      await useCase.execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: RESTORER });
      await expect(
        useCase.execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });

    it('throws GroupNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute({
          centerCode: CENTER,
          groupId: 'grp_00000000000000000000000099' as GroupId,
          updatedBy: RESTORER,
        }),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });

    it('throws GroupNotFoundError for an archived group in another center', async () => {
      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, groupId: GROUP_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
      // Still archived in its real center.
      expect(await groups.findById(GROUP_ID)).toBeNull();
      expect(await groups.findArchivedById(GROUP_ID)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new RestoreGroup(groups, fakeClock(), new PlanPolicy(planWithout));
      await expect(
        useCase.execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});
