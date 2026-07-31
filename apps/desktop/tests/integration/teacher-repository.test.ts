import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Teacher,
  TeacherId,
  SubjectId,
  PhoneNumber,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteTeacherRepository } from '../../src/data/sqlite/repositories/teacher-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let repo: SqliteTeacherRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-teacher-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteTeacherRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');
const BY = 'usr_00000000000000000000000002' as UserId;
const SUB_MATH = 'sub_00000000000000000000000001' as SubjectId;
const SUB_PHYS = 'sub_00000000000000000000000002' as SubjectId;

function makeTeacher(over: Partial<Teacher> = {}): Teacher {
  return {
    id: 'tch_00000000000000000000000001' as TeacherId,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    naturalKey: 'CS-CASA-001::yassine-alaoui-ياسين-العلوي::+212612345678',
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    cin: 'AB12345',
    phone: '+212612345678' as PhoneNumber,
    email: 'yassine@centre.ma',
    subjectIds: [SUB_MATH, SUB_PHYS],
    active: true,
    ...over,
  };
}

describe('SqliteTeacherRepository', () => {
  it('round-trips a teacher through save + findById with all fields intact', async () => {
    const teacher = makeTeacher();
    await repo.save(teacher);
    expect(await repo.findById(teacher.id)).toEqual(teacher);
  });

  it('stores null cin/email and an empty subjectIds array', async () => {
    await repo.save(
      makeTeacher({
        id: 'tch_00000000000000000000000009' as TeacherId,
        cin: null,
        email: null,
        subjectIds: [],
        naturalKey: 'nk-null',
      }),
    );
    const found = await repo.findById('tch_00000000000000000000000009' as TeacherId);
    expect(found?.cin).toBeNull();
    expect(found?.email).toBeNull();
    expect(found?.subjectIds).toEqual([]);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('tch_00000000000000000000000099' as TeacherId)).toBeNull();
  });

  it('findByNaturalKey returns the live match, null once soft-deleted', async () => {
    const teacher = makeTeacher();
    await repo.save(teacher);
    expect(await repo.findByNaturalKey(teacher.naturalKey)).toEqual(teacher);

    await repo.softDelete(teacher.id, new Date('2026-08-02T00:00:00Z'), BY);
    expect(await repo.findByNaturalKey(teacher.naturalKey)).toBeNull();
  });

  it('upsert updates mutable fields on a second save of the same id', async () => {
    await repo.save(makeTeacher());
    await repo.save(
      makeTeacher({
        name: { fr: 'Yassine A.', ar: 'ياسين' },
        cin: null,
        subjectIds: [SUB_MATH],
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById('tch_00000000000000000000000001' as TeacherId);
    expect(found?.name).toEqual({ fr: 'Yassine A.', ar: 'ياسين' });
    expect(found?.cin).toBeNull();
    expect(found?.subjectIds).toEqual([SUB_MATH]);
    expect(found?.version).toBe(3);
  });

  it('softDelete hides the row from findById but keeps it as a tombstone in the sync feed', async () => {
    const teacher = makeTeacher();
    await repo.save(teacher);
    await repo.softDelete(teacher.id, new Date('2026-08-02T00:00:00Z'), BY);

    expect(await repo.findById(teacher.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    // The tombstone records who archived — the delete-vs-edit conflict UI needs it.
    expect(changed[0]?.updatedBy).toBe(BY);
  });

  describe('countActive + listActive', () => {
    it('counts and lists only live teachers of the center, ordered by FR name', async () => {
      await repo.save(makeTeacher({ id: 'tch_00000000000000000000000001' as TeacherId, name: { fr: 'Zaid', ar: 'زيد' }, naturalKey: 'k-zaid' }));
      await repo.save(makeTeacher({ id: 'tch_00000000000000000000000002' as TeacherId, name: { fr: 'amine', ar: 'أمين' }, naturalKey: 'k-amine' }));
      const gone = makeTeacher({ id: 'tch_00000000000000000000000003' as TeacherId, name: { fr: 'Bilal', ar: 'بلال' }, naturalKey: 'k-bilal' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, BY);
      await repo.save(
        makeTeacher({ id: 'tch_00000000000000000000000004' as TeacherId, name: { fr: 'Farès', ar: 'فارس' }, naturalKey: 'k-other', centerCode: 'CS-RABAT-002' as CenterCode }),
      );

      expect(await repo.countActive('CS-CASA-001' as CenterCode)).toBe(2);
      const rows = await repo.listActive('CS-CASA-001' as CenterCode);
      expect(rows.map((t) => t.name.fr)).toEqual(['amine', 'Zaid']);
    });
  });

  describe('shared phone', () => {
    it('allows two teachers with the same phone but different natural keys', async () => {
      await repo.save(makeTeacher({ id: 'tch_00000000000000000000000001' as TeacherId, naturalKey: 'CS-CASA-001::a::+212612345678' }));
      await repo.save(makeTeacher({ id: 'tch_00000000000000000000000002' as TeacherId, naturalKey: 'CS-CASA-001::b::+212612345678' }));

      expect(await repo.findById('tch_00000000000000000000000001' as TeacherId)).not.toBeNull();
      expect(await repo.findById('tch_00000000000000000000000002' as TeacherId)).not.toBeNull();
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the tch_ prefix (CHECK)', async () => {
      await expect(repo.save(makeTeacher({ id: 'bad_00000000000000000000000001' as TeacherId }))).rejects.toThrow();
    });

    it('blocks a duplicate live natural key in one center (partial UNIQUE index)', async () => {
      await repo.save(makeTeacher({ id: 'tch_00000000000000000000000001' as TeacherId }));
      await expect(
        repo.save(makeTeacher({ id: 'tch_00000000000000000000000002' as TeacherId })), // same naturalKey
      ).rejects.toThrow();
    });

    it('permits recreation of a soft-deleted natural key (partial index skips tombstones)', async () => {
      const first = makeTeacher({ id: 'tch_00000000000000000000000001' as TeacherId });
      await repo.save(first);
      await repo.softDelete(first.id, new Date('2026-08-02T00:00:00Z'), BY);

      await expect(
        repo.save(makeTeacher({ id: 'tch_00000000000000000000000002' as TeacherId })), // same naturalKey, alive
      ).resolves.toBeUndefined();
    });
  });
});
