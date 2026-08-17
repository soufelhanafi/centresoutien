import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Niveau,
  NiveauId,
  Student,
  StudentId,
  Group,
  GroupId,
  Teacher,
  TeacherId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteNiveauRepository } from '../../src/data/sqlite/repositories/niveau-repository';
import { SqliteNiveauReference } from '../../src/data/sqlite/repositories/niveau-reference';
import { SqliteStudentRepository } from '../../src/data/sqlite/repositories/student-repository';
import { SqliteGroupRepository } from '../../src/data/sqlite/repositories/group-repository';
import { SqliteTeacherRepository } from '../../src/data/sqlite/repositories/teacher-repository';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const AT = new Date('2026-07-29T10:00:00Z');

let dir: string;
let db: DB;
let repo: SqliteNiveauRepository;
let reference: SqliteNiveauReference;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-niv-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteNiveauRepository(db, changeLogWriterForTest(db));
  reference = new SqliteNiveauReference(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeNiveau(over: Partial<Niveau> = {}): Niveau {
  return {
    id: 'niv_00000000000000000000000001' as NiveauId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا علوم الحياة والأرض' },
    code: '2BAC-SVT',
    category: 'lycee',
    active: true,
    ...over,
  };
}

function makeStudent(over: Partial<Student> = {}): Student {
  return {
    id: 'stu_00000000000000000000000001' as StudentId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    naturalKey: 'CS-CASA-001::yassinealaoui::2012-05-03',
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2012-05-03',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
    niveauId: 'niv_00000000000000000000000001' as NiveauId,
    ...over,
  };
}

function makeGroup(over: Partial<Group> = {}): Group {
  return {
    id: 'grp_00000000000000000000000001' as GroupId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    subjectId: 'sub_00000000000000000000000001',
    teacherId: null,
    niveauId: 'niv_00000000000000000000000001' as NiveauId,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...over,
  };
}

function makeTeacher(over: Partial<Teacher> = {}): Teacher {
  return {
    id: 'tch_00000000000000000000000001' as TeacherId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    naturalKey: 'CS-CASA-001::yassine-alaoui::+212612345678',
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    cin: 'AB12345',
    phone: '+212612345678',
    email: 'yassine@centre.ma',
    subjectIds: [],
    niveauIds: ['niv_00000000000000000000000001' as NiveauId],
    active: true,
    ...over,
  };
}

describe('SqliteNiveauRepository', () => {
  it('round-trips a niveau through save + findById with all fields intact', async () => {
    const niveau = makeNiveau();
    await repo.save(niveau);
    expect(await repo.findById(niveau.id)).toEqual(niveau);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('niv_00000000000000000000000099' as NiveauId)).toBeNull();
  });

  it('upsert updates mutable fields on a second save of the same id', async () => {
    await repo.save(makeNiveau());
    await repo.save(
      makeNiveau({
        name: { fr: '2ème Bac PC', ar: 'الثانية باكالوريا علوم فيزيائية' },
        code: '2BAC-PC',
        category: 'lycee',
        active: false,
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById('niv_00000000000000000000000001' as NiveauId);
    expect(found?.name.fr).toBe('2ème Bac PC');
    expect(found?.code).toBe('2BAC-PC');
    expect(found?.active).toBe(false);
    expect(found?.version).toBe(3);
  });

  it('softDelete hides the row from findById but keeps it as a tombstone in the sync feed', async () => {
    const niveau = makeNiveau();
    await repo.save(niveau);
    await repo.softDelete(niveau.id, new Date('2026-08-02T00:00:00Z'), USER);

    expect(await repo.findById(niveau.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('code', () => {
    it('findByCode returns the live niveau with that code, null once tombstoned', async () => {
      const niveau = makeNiveau({ code: '2BAC-SVT' });
      await repo.save(niveau);
      expect(await repo.findByCode(CENTER, '2BAC-SVT')).toEqual(niveau);

      await repo.softDelete(niveau.id, new Date('2026-08-02T00:00:00Z'), USER);
      expect(await repo.findByCode(CENTER, '2BAC-SVT')).toBeNull();
    });

    it('findByCode is center-scoped', async () => {
      await repo.save(makeNiveau({ code: '1AP' }));
      expect(await repo.findByCode('CS-RABAT-002' as CenterCode, '1AP')).toBeNull();
    });

    it('the partial unique index rejects a duplicate live code in the same center', async () => {
      await repo.save(makeNiveau({ id: 'niv_00000000000000000000000001' as NiveauId, code: '1AP' }));
      await expect(
        repo.save(makeNiveau({ id: 'niv_00000000000000000000000002' as NiveauId, code: '1AP' })),
      ).rejects.toThrow();
    });

    it('allows the same code across centers and after a soft delete, and NULL codes never clash', async () => {
      await repo.save(makeNiveau({ id: 'niv_00000000000000000000000001' as NiveauId, code: '1AP' }));
      // Different center → allowed.
      await repo.save(
        makeNiveau({
          id: 'niv_00000000000000000000000002' as NiveauId,
          centerCode: 'CS-RABAT-002' as CenterCode,
          code: '1AP',
        }),
      );
      // Free the code by tombstoning, then reuse it in the original center.
      await repo.softDelete('niv_00000000000000000000000001' as NiveauId, new Date('2026-08-02T00:00:00Z'), USER);
      await expect(
        repo.save(makeNiveau({ id: 'niv_00000000000000000000000003' as NiveauId, code: '1AP' })),
      ).resolves.toBeUndefined();
      // Two NULL codes never clash.
      await expect(
        repo.save(makeNiveau({ id: 'niv_00000000000000000000000004' as NiveauId, code: null })),
      ).resolves.toBeUndefined();
    });
  });

  describe('listActive / listAll', () => {
    beforeEach(async () => {
      await repo.save(makeNiveau({ id: 'niv_00000000000000000000000001' as NiveauId, name: { fr: '1AP', ar: 'الأولى ابتدائي' }, code: '1AP', category: 'primaire', active: true }));
      await repo.save(makeNiveau({ id: 'niv_00000000000000000000000002' as NiveauId, name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' }, code: '2BAC-SVT', category: 'lycee', active: false }));
      // Tombstoned — excluded from both lists.
      const gone = makeNiveau({ id: 'niv_00000000000000000000000003' as NiveauId, name: { fr: '1AC', ar: 'الأولى إعدادي' }, code: '1AC', category: 'college' });
      await repo.save(gone);
      await repo.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), USER);
      // Another center — never mixed in.
      await repo.save(makeNiveau({ id: 'niv_00000000000000000000000004' as NiveauId, centerCode: 'CS-RABAT-002' as CenterCode, name: { fr: '3AC', ar: 'الثالثة إعدادي' }, code: '3AC', category: 'college' }));
    });

    it('listActive returns only live, active niveaux of the center', async () => {
      const rows = await repo.listActive(CENTER);
      expect(rows.map((n) => n.code)).toEqual(['1AP']);
    });

    it('listAll returns every live niveau (active + inactive), excluding tombstones and other centers', async () => {
      const rows = await repo.listAll(CENTER);
      // Adapter ordering is raw category text (college < lycee < primaire);
      // the ListNiveaux use case re-sorts by the domain category rank.
      expect(rows.map((n) => n.code)).toEqual(['2BAC-SVT', '1AP']);
    });
  });

  describe('listWithUsage', () => {
    it('counts live students, groups, and teachers referencing the niveau', async () => {
      await repo.save(makeNiveau());
      await new SqliteStudentRepository(db).save(makeStudent());
      await new SqliteGroupRepository(db).save(makeGroup());
      await new SqliteTeacherRepository(db).save(makeTeacher());

      const rows = await repo.listWithUsage(CENTER);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ inUseCount: 3, canDelete: false });
      expect(rows[0]?.references.map((r) => r.kind).sort()).toEqual(['group', 'student', 'teacher']);
    });

    it('excludes tombstoned references and foreign-center rows from the count', async () => {
      await repo.save(makeNiveau());
      const students = new SqliteStudentRepository(db);
      const group = new SqliteGroupRepository(db);
      await students.save(makeStudent());
      await group.save(makeGroup());
      // Tombstone the student + group; their references must drop out.
      await students.softDelete('stu_00000000000000000000000001' as StudentId, new Date('2026-08-02T00:00:00Z'), USER);
      await group.softDelete('grp_00000000000000000000000001' as GroupId, new Date('2026-08-02T00:00:00Z'), USER);
      await new SqliteTeacherRepository(db).save(
        makeTeacher({ centerCode: 'CS-RABAT-002' as CenterCode }),
      );

      const rows = await repo.listWithUsage(CENTER);
      expect(rows[0]).toMatchObject({ inUseCount: 0, canDelete: true, references: [] });
    });

    it('groups the named references per niveau', async () => {
      await repo.save(makeNiveau({ id: 'niv_00000000000000000000000001' as NiveauId, code: '2BAC-SVT' }));
      await repo.save(makeNiveau({ id: 'niv_00000000000000000000000002' as NiveauId, code: '1AP', category: 'primaire', name: { fr: '1AP', ar: 'الأولى ابتدائي' } }));
      const students = new SqliteStudentRepository(db);
      await students.save(makeStudent({ niveauId: 'niv_00000000000000000000000002' as NiveauId }));
      await students.save(
        makeStudent({ id: 'stu_00000000000000000000000002' as StudentId, name: { fr: 'Amine', ar: 'أمين' }, niveauId: 'niv_00000000000000000000000002' as NiveauId }),
      );

      const rows = await repo.listWithUsage(CENTER);
      const ap = rows.find((r) => r.niveau.id === 'niv_00000000000000000000000002');
      expect(ap?.inUseCount).toBe(2);
      expect(ap?.references.map((r) => r.label.fr).sort()).toEqual(['Amine', 'Yassine Alaoui']);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the niv_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeNiveau({ id: 'bad_00000000000000000000000001' as NiveauId })),
      ).rejects.toThrow();
    });

    it('rejects an out-of-range category (CHECK)', async () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO niveaux
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name_fr, name_ar, code, category, active)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,1)`,
          )
          .run(
            'niv_00000000000000000000000005',
            CENTER,
            DEVICE,
            AT.toISOString(),
            AT.toISOString(),
            USER,
            'Niveau',
            'مستوى',
            null,
            'university',
          ),
      ).toThrow();
    });

    it('rejects an out-of-range active value (CHECK active IN (0,1))', async () => {
      await repo.save(makeNiveau());
      expect(() =>
        db
          .prepare('UPDATE niveaux SET active = 2 WHERE id = ?')
          .run('niv_00000000000000000000000001'),
      ).toThrow();
    });
  });
});

describe('SqliteNiveauReference (migration + retrofit round-trip)', () => {
  it('isNiveauInUse is true when a live student, group, or teacher references the niveau', async () => {
    const niveauId = 'niv_00000000000000000000000001' as NiveauId;
    await repo.save(makeNiveau());

    expect(await reference.isNiveauInUse(niveauId)).toBe(false);

    await new SqliteStudentRepository(db).save(makeStudent());
    expect(await reference.isNiveauInUse(niveauId)).toBe(true);
  });

  it('reports not-in-use once every referencing row is tombstoned', async () => {
    const niveauId = 'niv_00000000000000000000000001' as NiveauId;
    await repo.save(makeNiveau());
    const students = new SqliteStudentRepository(db);
    const groups = new SqliteGroupRepository(db);
    const teachers = new SqliteTeacherRepository(db);
    await students.save(makeStudent());
    await groups.save(makeGroup());
    await teachers.save(makeTeacher());

    expect(await reference.isNiveauInUse(niveauId)).toBe(true);
    await students.softDelete('stu_00000000000000000000000001' as StudentId, new Date('2026-08-02T00:00:00Z'), USER);
    await groups.softDelete('grp_00000000000000000000000001' as GroupId, new Date('2026-08-02T00:00:00Z'), USER);
    await teachers.softDelete('tch_00000000000000000000000001' as TeacherId, new Date('2026-08-02T00:00:00Z'), USER);
    expect(await reference.isNiveauInUse(niveauId)).toBe(false);
  });

  it('retrofit columns round-trip: niveauId on students/groups, niveauIds on teachers', async () => {
    const students = new SqliteStudentRepository(db);
    const groups = new SqliteGroupRepository(db);
    const teachers = new SqliteTeacherRepository(db);

    const student = makeStudent({ niveauId: 'niv_00000000000000000000000007' as NiveauId });
    const group = makeGroup({ niveauId: 'niv_00000000000000000000000007' as NiveauId });
    const teacher = makeTeacher({
      niveauIds: ['niv_00000000000000000000000007' as NiveauId, 'niv_00000000000000000000000008' as NiveauId],
    });
    await students.save(student);
    await groups.save(group);
    await teachers.save(teacher);

    expect((await students.findById(student.id))?.niveauId).toBe('niv_00000000000000000000000007');
    expect((await groups.findById(group.id))?.niveauId).toBe('niv_00000000000000000000000007');
    expect((await teachers.findById(teacher.id))?.niveauIds).toEqual([
      'niv_00000000000000000000000007',
      'niv_00000000000000000000000008',
    ]);

    // Null backfill default is preserved on read.
    await students.save(makeStudent({ id: 'stu_00000000000000000000000002' as StudentId, niveauId: null }));
    expect((await students.findById('stu_00000000000000000000000002' as StudentId))?.niveauId).toBeNull();
  });
});
