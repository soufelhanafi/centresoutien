import { describe, it, expect, beforeEach } from 'vitest';
import { ListParentChildren } from '../../../src/use-cases/list-parent-children';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { ArchiveStudent } from '../../../src/use-cases/archive-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { ParentId } from '../../../src/entities/parent';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

const DAD = 'prt_00000000000000000000000001' as ParentId;
const MUM = 'prt_00000000000000000000000002' as ParentId;

function studentInput(overrides: Partial<CreateStudentInput> = {}): CreateStudentInput {
  return {
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2010-01-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [DAD],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

function planWithoutParents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(['core.students']), limits: PLANS.essentiel.limits };
}

describe('ListParentChildren', () => {
  let students: InMemoryStudentRepository;
  let create: CreateStudent;
  let archive: ArchiveStudent;
  let list: ListParentChildren;

  beforeEach(() => {
    students = new InMemoryStudentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateStudent(students, fakeClock(), fakeIds(), plan);
    archive = new ArchiveStudent(students, fakeClock(), plan);
    list = new ListParentChildren(students, plan);
  });

  it("returns every live child linked to the guardian, sorted by French name", async () => {
    await create.execute(studentInput({ name: { fr: 'Zaid Alaoui', ar: 'زيد' }, birthDate: '2012-03-03', guardianIds: [DAD] }));
    await create.execute(studentInput({ name: { fr: 'Amine Alaoui', ar: 'أمين' }, birthDate: '2010-01-01', guardianIds: [DAD, MUM] }));
    // A child of a different guardian only — must not appear for DAD.
    await create.execute(studentInput({ name: { fr: 'Nadia Cherkaoui', ar: 'نادية' }, birthDate: '2011-02-02', guardianIds: [MUM] }));

    const result = await list.execute({ centerCode: CENTER, parentId: DAD });
    expect(result.map((s) => s.name.fr)).toEqual(['Amine Alaoui', 'Zaid Alaoui']);
  });

  it('returns an empty list for a guardian with no children', async () => {
    const result = await list.execute({ centerCode: CENTER, parentId: MUM });
    expect(result).toEqual([]);
  });

  it('excludes archived children', async () => {
    const zaid = await create.execute(studentInput({ name: { fr: 'Zaid Alaoui', ar: 'زيد' }, birthDate: '2012-03-03', guardianIds: [DAD] }));
    await create.execute(studentInput({ name: { fr: 'Amine Alaoui', ar: 'أمين' }, birthDate: '2010-01-01', guardianIds: [DAD] }));
    await archive.execute({ centerCode: CENTER, id: zaid.id, updatedBy: USER });

    const result = await list.execute({ centerCode: CENTER, parentId: DAD });
    expect(result.map((s) => s.name.fr)).toEqual(['Amine Alaoui']);
  });

  it('does not leak a linked child from another center (tenant scope)', async () => {
    // Same guardian id, but the child belongs to another center's DB.
    await create.execute(studentInput({ centerCode: OTHER, guardianIds: [DAD] }));
    const result = await list.execute({ centerCode: CENTER, parentId: DAD });
    expect(result).toEqual([]);
  });

  it('is gated by core.parents', async () => {
    const locked = new ListParentChildren(students, new PlanPolicy(planWithoutParents()));
    await expect(
      locked.execute({ centerCode: CENTER, parentId: DAD }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
