import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveGroup } from '../../../src/use-cases/archive-group';
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

describe('ArchiveGroup', () => {
  let groups: InMemoryGroupRepository;

  function build(plan: Plan = PLANS.essentiel): ArchiveGroup {
    return new ArchiveGroup(groups, fakeClock('2026-07-30T09:00:00Z'), new PlanPolicy(plan));
  }

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    await groups.save(seededGroup());
  });

  describe('happy path', () => {
    it('soft-deletes the group so it is excluded from default reads', async () => {
      await build().execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: USER });
      expect(await groups.findById(GROUP_ID)).toBeNull();
    });

    it('leaves a tombstone (deletedAt set) visible to listChangedSince for sync', async () => {
      await build().execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: USER });

      const changed = await groups.listChangedSince(new Date('2026-07-30T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.id).toBe(GROUP_ID);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-07-30T09:00:00Z'));
      // The tombstone records *who* archived, so a delete-vs-edit conflict can attribute it.
      expect(changed[0]?.updatedBy).toBe(USER);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(
        build(planWithout).execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(await groups.findById(GROUP_ID)).not.toBeNull();
    });
  });

  describe('not found / tenant scoping', () => {
    it('throws GroupNotFoundError for an unknown id and touches nothing', async () => {
      await expect(
        build().execute({
          centerCode: CENTER,
          groupId: 'grp_00000000000000000000000099' as GroupId,
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
      expect(await groups.findById(GROUP_ID)).not.toBeNull();
    });

    it('throws GroupNotFoundError for a group in another center (no cross-tenant archive)', async () => {
      await expect(
        build().execute({ centerCode: OTHER_CENTER, groupId: GROUP_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
      expect(await groups.findById(GROUP_ID)).not.toBeNull();
    });

    it('throws GroupNotFoundError when the group is already archived', async () => {
      await build().execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: USER });
      await expect(
        build().execute({ centerCode: CENTER, groupId: GROUP_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });
  });
});
