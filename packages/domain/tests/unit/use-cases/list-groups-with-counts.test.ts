import { describe, it, expect, beforeEach } from 'vitest';
import { ListGroups } from '../../../src/use-cases/list-groups';
import { ListGroupsWithCounts } from '../../../src/use-cases/list-groups-with-counts';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { SubjectId } from '../../../src/entities/subject';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;

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

let enrollmentSeq = 0;
function makeEnrollment(groupId: GroupId, overrides: Partial<Enrollment> = {}): Enrollment {
  enrollmentSeq += 1;
  const suffix = String(enrollmentSeq).padStart(26, '0');
  return {
    id: `enr_${suffix}` as EnrollmentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    studentId: `stu_${suffix}` as StudentId,
    groupId,
    startMonth: '2026-09',
    endMonth: null,
    ...overrides,
  };
}

describe('ListGroupsWithCounts', () => {
  let groups: InMemoryGroupRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let useCase: ListGroupsWithCounts;

  beforeEach(() => {
    groups = new InMemoryGroupRepository();
    enrollments = new InMemoryEnrollmentRepository();
    const listGroups = new ListGroups(groups, new PlanPolicy(PLANS.essentiel));
    useCase = new ListGroupsWithCounts(listGroups, enrollments);
  });

  it('attaches each group\'s live enrollment count, preserving the list order', async () => {
    const troncCommun = makeGroup({ level: 'Tronc Commun' });
    const premiere = makeGroup({ level: '1ère Bac' });
    await groups.save(troncCommun);
    await groups.save(premiere);
    // Two live seats in premiere, one in troncCommun.
    await enrollments.save(makeEnrollment(premiere.id));
    await enrollments.save(makeEnrollment(premiere.id));
    await enrollments.save(makeEnrollment(troncCommun.id));

    const rows = await useCase.execute({ centerCode: CENTER, scope: 'active' });

    // Ordered by level then id — same as ListGroups: '1ère Bac' before 'Tronc Commun'.
    expect(rows.map((r) => ({ id: r.group.id, n: r.enrolledCount }))).toEqual([
      { id: premiere.id, n: 2 },
      { id: troncCommun.id, n: 1 },
    ]);
  });

  it('reports 0 for a group with no live enrollment (absent from the batch map)', async () => {
    const empty = makeGroup();
    await groups.save(empty);

    const rows = await useCase.execute({ centerCode: CENTER, scope: 'active' });
    expect(rows).toEqual([{ group: expect.objectContaining({ id: empty.id }), enrolledCount: 0 }]);
  });

  it('does not count an unenrolled (soft-deleted) enrollment row', async () => {
    const group = makeGroup();
    await groups.save(group);
    await enrollments.save(makeEnrollment(group.id));
    const gone = makeEnrollment(group.id);
    await enrollments.save(gone);
    await enrollments.softDelete(gone.id, new Date('2026-08-01T00:00:00Z'), USER);

    const rows = await useCase.execute({ centerCode: CENTER, scope: 'active' });
    expect(rows[0]?.enrolledCount).toBe(1);
  });

  it('matches the single-group countActiveByGroup for the same group', async () => {
    const group = makeGroup();
    await groups.save(group);
    await enrollments.save(makeEnrollment(group.id));
    await enrollments.save(makeEnrollment(group.id));

    const rows = await useCase.execute({ centerCode: CENTER, scope: 'active' });
    expect(rows[0]?.enrolledCount).toBe(await enrollments.countActiveByGroup(group.id));
  });

  it('propagates the core.groups gate from ListGroups', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListGroupsWithCounts(
      new ListGroups(groups, new PlanPolicy(planWithout)),
      enrollments,
    );
    await expect(useCase.execute({ centerCode: CENTER, scope: 'active' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
