import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Subject, SubjectId, CenterCode, DeviceId, UserId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let repo: SqliteSubjectRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-subj-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteSubjectRepository(db, changeLogWriterForTest(db));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

function makeSubject(over: Partial<Subject> = {}): Subject {
  return {
    id: 'sub_00000000000000000000000001' as SubjectId,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    code: null,
    active: true,
    ...over,
  };
}

describe('SqliteSubjectRepository', () => {
  it('round-trips a subject through save + findById with all fields intact', async () => {
    const subject = makeSubject();
    await repo.save(subject);
    expect(await repo.findById(subject.id)).toEqual(subject);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('sub_00000000000000000000000099' as SubjectId)).toBeNull();
  });

  it('upsert updates mutable fields on a second save of the same id', async () => {
    await repo.save(makeSubject());
    await repo.save(
      makeSubject({ name: { fr: 'Physique', ar: 'الفيزياء' }, active: false, version: 3, updatedAt: new Date('2026-08-01T09:00:00Z') }),
    );
    const found = await repo.findById('sub_00000000000000000000000001' as SubjectId);
    expect(found?.name).toEqual({ fr: 'Physique', ar: 'الفيزياء' });
    expect(found?.active).toBe(false);
    expect(found?.version).toBe(3);
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const subject = makeSubject();
    await repo.save(subject);
    await repo.softDelete(subject.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);

    expect(await repo.findById(subject.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });

  describe('code', () => {
    it('round-trips a subject with a code intact', async () => {
      const subject = makeSubject({ code: 'MATH' });
      await repo.save(subject);
      expect(await repo.findById(subject.id)).toEqual(subject);
    });

    it('findByCode returns the live subject with that code in the center', async () => {
      const subject = makeSubject({ code: 'MATH' });
      await repo.save(subject);
      expect(await repo.findByCode('CS-CASA-001' as CenterCode, 'MATH')).toEqual(subject);
    });

    it('findByCode returns null for an unknown code', async () => {
      await repo.save(makeSubject({ code: 'MATH' }));
      expect(await repo.findByCode('CS-CASA-001' as CenterCode, 'PC')).toBeNull();
    });

    it('findByCode is center-scoped', async () => {
      await repo.save(makeSubject({ code: 'MATH' }));
      expect(await repo.findByCode('CS-RABAT-002' as CenterCode, 'MATH')).toBeNull();
    });

    it('findByCode ignores a tombstoned subject (freed code)', async () => {
      const subject = makeSubject({ code: 'MATH' });
      await repo.save(subject);
      await repo.softDelete(subject.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);
      expect(await repo.findByCode('CS-CASA-001' as CenterCode, 'MATH')).toBeNull();
    });

    it('the partial unique index rejects a duplicate live code in the same center', async () => {
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000001' as SubjectId, code: 'MATH' }));
      await expect(
        repo.save(makeSubject({ id: 'sub_00000000000000000000000002' as SubjectId, code: 'MATH' })),
      ).rejects.toThrow();
    });

    it('allows the same code across centers and after a soft delete', async () => {
      const casa = makeSubject({ id: 'sub_00000000000000000000000001' as SubjectId, code: 'MATH' });
      await repo.save(casa);
      // Different center → allowed.
      await repo.save(
        makeSubject({
          id: 'sub_00000000000000000000000002' as SubjectId,
          centerCode: 'CS-RABAT-002' as CenterCode,
          code: 'MATH',
        }),
      );
      // Free the code by tombstoning, then reuse it in the original center.
      await repo.softDelete(casa.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);
      await expect(
        repo.save(makeSubject({ id: 'sub_00000000000000000000000003' as SubjectId, code: 'MATH' })),
      ).resolves.toBeUndefined();
    });

    it('allows multiple live subjects with no code (NULLs do not clash)', async () => {
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000001' as SubjectId, code: null }));
      await expect(
        repo.save(makeSubject({ id: 'sub_00000000000000000000000002' as SubjectId, code: null })),
      ).resolves.toBeUndefined();
    });
  });

  describe('listActive / listAll', () => {
    const CASA = 'CS-CASA-001' as CenterCode;

    beforeEach(async () => {
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000001' as SubjectId, name: { fr: 'Physique', ar: 'فيزياء' }, active: true }));
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000002' as SubjectId, name: { fr: 'Arabe', ar: 'العربية' }, active: true }));
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000003' as SubjectId, name: { fr: 'Chimie', ar: 'كيمياء' }, active: false }));
      // Tombstoned — excluded from both lists.
      const gone = makeSubject({ id: 'sub_00000000000000000000000004' as SubjectId, name: { fr: 'Anglais', ar: 'إنجليزية' } });
      await repo.save(gone);
      await repo.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);
      // Another center — never mixed in.
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000005' as SubjectId, centerCode: 'CS-RABAT-002' as CenterCode, name: { fr: 'Géographie', ar: 'جغرافيا' } }));
    });

    it('listActive returns only live, active subjects of the center, name-ordered', async () => {
      const rows = await repo.listActive(CASA);
      expect(rows.map((s) => s.name.fr)).toEqual(['Arabe', 'Physique']);
    });

    it('listAll returns every live subject (active + inactive), excluding tombstones and other centers', async () => {
      const rows = await repo.listAll(CASA);
      expect(rows.map((s) => s.name.fr)).toEqual(['Arabe', 'Chimie', 'Physique']);
    });
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000001' as SubjectId, updatedAt: new Date('2026-07-01T00:00:00Z') }));
      await repo.save(makeSubject({ id: 'sub_00000000000000000000000002' as SubjectId, updatedAt: new Date('2026-07-20T00:00:00Z') }));

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((s) => s.id)).toEqual(['sub_00000000000000000000000002']);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the sub_ prefix (CHECK)', async () => {
      await expect(repo.save(makeSubject({ id: 'bad_00000000000000000000000001' as SubjectId }))).rejects.toThrow();
    });

    it('rejects an out-of-range active value (CHECK active IN (0,1))', () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO subjects
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name_fr, name_ar, active)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,2)`,
          )
          .run(
            'sub_00000000000000000000000005',
            'CS-CASA-001',
            'dev_1',
            AT.toISOString(),
            AT.toISOString(),
            'usr_1',
            'M',
            'م',
          ),
      ).toThrow();
    });
  });
});
