import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import type { Student, StudentId, ParentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const AT = new Date('2026-07-29T10:00:00Z');

let n = 0;
function makeStudent(over: Partial<Student> = {}): Student {
  n += 1;
  return {
    id: `stu_${String(n).padStart(26, '0')}` as StudentId,
    naturalKey: 'CS-CASA-001::yassine::2012-05-03',
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    name: { fr: 'Yassine', ar: 'ياسين' },
    birthDate: '2012-05-03',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [] as ParentId[],
    ...over,
  };
}

describe('StudentRepository (in-memory contract)', () => {
  let repo: InMemoryStudentRepository;

  beforeEach(() => {
    n = 0;
    repo = new InMemoryStudentRepository();
  });

  it('softDelete hides the row from findById but keeps it in the sync feed', async () => {
    const student = makeStudent();
    await repo.save(student);
    await repo.softDelete(student.id, new Date('2026-08-02T00:00:00Z'));

    expect(await repo.findById(student.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });

  it('allows recreating a person after a soft delete (no unique block on naturalKey)', async () => {
    const first = makeStudent();
    await repo.save(first);
    await repo.softDelete(first.id, new Date('2026-08-02T00:00:00Z'));

    const second = makeStudent({ naturalKey: first.naturalKey });
    await expect(repo.save(second)).resolves.toBeUndefined();
    expect(await repo.findById(second.id)).not.toBeNull();
  });

  describe('findByNaturalKey', () => {
    it('returns every live match — matching hint, not a uniqueness constraint', async () => {
      const key = 'CS-CASA-001::same-name::2012-05-03';
      await repo.save(makeStudent({ naturalKey: key }));
      await repo.save(makeStudent({ naturalKey: key }));

      expect(await repo.findByNaturalKey(CENTER, key)).toHaveLength(2);
    });

    it('excludes tombstones and other centers', async () => {
      const key = 'CS-CASA-001::same-name::2012-05-03';
      const alive = makeStudent({ naturalKey: key });
      const deleted = makeStudent({ naturalKey: key });
      await repo.save(alive);
      await repo.save(deleted);
      await repo.softDelete(deleted.id, AT);
      await repo.save(makeStudent({ naturalKey: key, centerCode: OTHER_CENTER }));

      const matches = await repo.findByNaturalKey(CENTER, key);
      expect(matches.map((s) => s.id)).toEqual([alive.id]);
    });
  });

  describe('countActive', () => {
    it('counts only live students in the given center', async () => {
      await repo.save(makeStudent());
      const gone = makeStudent();
      await repo.save(gone);
      await repo.softDelete(gone.id, AT);
      await repo.save(makeStudent({ centerCode: OTHER_CENTER }));

      expect(await repo.countActive(CENTER)).toBe(1);
      expect(await repo.countActive(OTHER_CENTER)).toBe(1);
    });
  });
});
