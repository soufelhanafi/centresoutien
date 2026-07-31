import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Enrollment,
  EnrollmentId,
  CenterCode,
  DeviceId,
  GroupId,
  StudentId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import {
  loadMigrations,
  applyMigrations,
  runMigrations,
} from '../../src/data/sqlite/migration-runner';
import { SqliteEnrollmentRepository } from '../../src/data/sqlite/repositories/enrollment-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const GROUP_A = 'grp_00000000000000000000000001' as GroupId;
const GROUP_B = 'grp_00000000000000000000000002' as GroupId;
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_B = 'stu_00000000000000000000000002' as StudentId;

let dir: string;
let db: DB;
let repo: SqliteEnrollmentRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-enr-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteEnrollmentRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeEnrollment(over: Partial<Enrollment> = {}): Enrollment {
  seq += 1;
  return {
    id: `enr_${String(seq).padStart(26, '0')}` as EnrollmentId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    studentId: STUDENT_A,
    groupId: GROUP_A,
    startMonth: '2026-09',
    endMonth: null,
    ...over,
  };
}

describe('SqliteEnrollmentRepository', () => {
  it('round-trips an enrollment through save + findById with all fields intact', async () => {
    const enrollment = makeEnrollment({ startMonth: '2026-09', endMonth: '2027-06', version: 4 });
    await repo.save(enrollment);
    expect(await repo.findById(enrollment.id)).toEqual(enrollment);
  });

  it('round-trips a null endMonth (open-ended enrollment)', async () => {
    const enrollment = makeEnrollment({ endMonth: null });
    await repo.save(enrollment);
    expect((await repo.findById(enrollment.id))?.endMonth).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('enr_00000000000000000000000099' as EnrollmentId)).toBeNull();
  });

  it('upsert updates mutable fields + version but not identity on a second save', async () => {
    const enrollment = makeEnrollment();
    await repo.save(enrollment);
    await repo.save(
      makeEnrollment({
        id: enrollment.id,
        endMonth: '2027-06',
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById(enrollment.id);
    expect(found?.endMonth).toBe('2027-06');
    expect(found?.version).toBe(3);
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.deviceOrigin).toBe(DEVICE);
  });

  describe('softDelete', () => {
    it('hides the row from findById but keeps it as a tombstone in the sync feed', async () => {
      const enrollment = makeEnrollment();
      await repo.save(enrollment);
      await repo.softDelete(enrollment.id, new Date('2026-08-02T00:00:00Z'), USER);

      expect(await repo.findById(enrollment.id)).toBeNull();
      const changed = await repo.listChangedSince(AT);
      expect(changed).toHaveLength(1);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
      expect(changed[0]?.updatedBy).toBe(USER);
    });

    it('excludes the row from every active read AND from hasActiveEnrollment', async () => {
      const enrollment = makeEnrollment();
      await repo.save(enrollment);
      await repo.softDelete(enrollment.id, new Date('2026-08-02T00:00:00Z'), USER);

      expect(await repo.listActiveByGroup(GROUP_A)).toHaveLength(0);
      expect(await repo.listActiveByStudent(STUDENT_A)).toHaveLength(0);
      expect(await repo.countActiveByGroup(GROUP_A)).toBe(0);
      expect(await repo.hasActiveEnrollment(STUDENT_A, GROUP_A)).toBe(false);
    });
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeEnrollment({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      const later = makeEnrollment({
        studentId: STUDENT_B,
        updatedAt: new Date('2026-07-20T00:00:00Z'),
      });
      await repo.save(later);

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((e) => e.id)).toEqual([later.id]);
    });
  });

  describe('listActiveByGroup / listActiveByStudent', () => {
    it('returns only live rows of the group, excluding tombstones and other groups', async () => {
      await repo.save(makeEnrollment({ studentId: STUDENT_A, groupId: GROUP_A }));
      await repo.save(makeEnrollment({ studentId: STUDENT_B, groupId: GROUP_A }));
      const gone = makeEnrollment({ studentId: STUDENT_A, groupId: GROUP_A });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeEnrollment({ studentId: STUDENT_A, groupId: GROUP_B }));

      const inA = await repo.listActiveByGroup(GROUP_A);
      expect(inA.map((e) => e.studentId).sort()).toEqual([STUDENT_A, STUDENT_B]);
    });

    it('returns only live rows the student holds, across groups', async () => {
      await repo.save(makeEnrollment({ studentId: STUDENT_A, groupId: GROUP_A }));
      await repo.save(makeEnrollment({ studentId: STUDENT_A, groupId: GROUP_B }));
      await repo.save(makeEnrollment({ studentId: STUDENT_B, groupId: GROUP_A }));

      const held = await repo.listActiveByStudent(STUDENT_A);
      expect(held.map((e) => e.groupId).sort()).toEqual([GROUP_A, GROUP_B]);
    });
  });

  describe('countActiveByGroup', () => {
    it('counts distinct live rows, ignoring tombstones and other groups', async () => {
      await repo.save(makeEnrollment({ studentId: STUDENT_A, groupId: GROUP_A }));
      await repo.save(makeEnrollment({ studentId: STUDENT_B, groupId: GROUP_A }));
      await repo.save(makeEnrollment({ studentId: STUDENT_A, groupId: GROUP_B }));
      const gone = makeEnrollment({ studentId: STUDENT_B, groupId: GROUP_B });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);

      expect(await repo.countActiveByGroup(GROUP_A)).toBe(2);
      expect(await repo.countActiveByGroup(GROUP_B)).toBe(1);
    });
  });

  describe('saveIfAbsent (atomic duplicate guard)', () => {
    it('inserts and returns true when no live row exists', async () => {
      const first = makeEnrollment();
      expect(await repo.saveIfAbsent(first)).toBe(true);
      expect(await repo.findById(first.id)).not.toBeNull();
      expect(await repo.hasActiveEnrollment(STUDENT_A, GROUP_A)).toBe(true);
    });

    it('does not insert and returns false when a live (student, group) already exists', async () => {
      await repo.saveIfAbsent(makeEnrollment({ id: 'enr_00000000000000000000000010' as EnrollmentId }));
      const duplicate = makeEnrollment({ id: 'enr_00000000000000000000000011' as EnrollmentId });
      expect(await repo.saveIfAbsent(duplicate)).toBe(false);

      // The second id was never written — no phantom seat.
      expect(await repo.findById(duplicate.id)).toBeNull();
      expect(await repo.countActiveByGroup(GROUP_A)).toBe(1);
    });

    it('allows re-enroll after unenroll (a tombstoned row does not block the insert)', async () => {
      const first = makeEnrollment({ id: 'enr_00000000000000000000000020' as EnrollmentId });
      await repo.saveIfAbsent(first);
      await repo.softDelete(first.id, new Date('2026-08-01T00:00:00Z'), USER);

      const second = makeEnrollment({ id: 'enr_00000000000000000000000021' as EnrollmentId });
      expect(await repo.saveIfAbsent(second)).toBe(true);
      expect(await repo.findById(second.id)).not.toBeNull();
      expect(await repo.countActiveByGroup(GROUP_A)).toBe(1);
    });

    it('does not block the same student in a different group', async () => {
      await repo.saveIfAbsent(makeEnrollment({ id: 'enr_00000000000000000000000030' as EnrollmentId, groupId: GROUP_A }));
      const other = makeEnrollment({ id: 'enr_00000000000000000000000031' as EnrollmentId, groupId: GROUP_B });
      expect(await repo.saveIfAbsent(other)).toBe(true);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the enr_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeEnrollment({ id: 'bad_00000000000000000000000001' as EnrollmentId })),
      ).rejects.toThrow();
    });

    it('rejects an endMonth before startMonth (CHECK)', async () => {
      await expect(
        repo.save(makeEnrollment({ startMonth: '2026-09', endMonth: '2026-08' })),
      ).rejects.toThrow();
    });

    it('has NO UNIQUE(student_id, group_id): two live rows are storable at the DB level (domain guards duplicates)', async () => {
      // The domain refuses a duplicate; the *schema* must not, so concurrent
      // creates converge on sync-resolve instead of a rejected push (SOU-123).
      await repo.save(makeEnrollment({ id: 'enr_00000000000000000000000040' as EnrollmentId }));
      await expect(
        repo.save(makeEnrollment({ id: 'enr_00000000000000000000000041' as EnrollmentId })),
      ).resolves.toBeUndefined();
      expect(await repo.countActiveByGroup(GROUP_A)).toBe(2);
    });
  });

  describe('migration replay', () => {
    it('applies 0016 cleanly on a DB already migrated to a prior version (0015)', () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-enr-replay-'));
      const stale = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo15 = all.filter((m) => m.version <= 15);
        // A laptop that stopped at 0015: enrollments does not exist yet.
        applyMigrations(stale, upTo15);
        expect(() =>
          stale.prepare('SELECT 1 FROM enrollments LIMIT 1').get(),
        ).toThrow();

        // Update to head: 0016 applies additively, no rebuild, no error.
        const applied = applyMigrations(stale, all);
        expect(applied).toContain(16);

        const enrollments = new SqliteEnrollmentRepository(stale);
        void enrollments; // table is now usable
        expect(stale.prepare('SELECT COUNT(*) AS n FROM enrollments').get()).toEqual({ n: 0 });
      } finally {
        stale.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
