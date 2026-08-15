import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  DeviceId,
  TeacherAvailability,
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
  TeacherAvailabilityId,
  TeacherId,
  TimeOfDay,
  UserId,
  WeeklyTimeWindows,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteTeacherAvailabilityRepository } from '../../src/data/sqlite/repositories/teacher-availability-repository';
import { SqliteTeacherAvailabilityExceptionRepository } from '../../src/data/sqlite/repositories/teacher-availability-exception-repository';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const AT = new Date('2026-01-15T10:00:00Z');
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER = 'tch_00000000000000000000000001' as TeacherId;
const OTHER_TEACHER = 'tch_00000000000000000000000002' as TeacherId;

const win = (open: string, close: string) => ({ open: open as TimeOfDay, close: close as TimeOfDay });
const emptyWeek = (): WeeklyTimeWindows => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

let dir: string;
let db: DB;
let availabilityRepo: SqliteTeacherAvailabilityRepository;
let exceptionRepo: SqliteTeacherAvailabilityExceptionRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-teacher-availability-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  const changeLog = changeLogWriterForTest(db);
  availabilityRepo = new SqliteTeacherAvailabilityRepository(db, changeLog);
  exceptionRepo = new SqliteTeacherAvailabilityExceptionRepository(db, changeLog);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

let availabilitySeq = 1;
function makeAvailability(over: Partial<TeacherAvailability> = {}): TeacherAvailability {
  return {
    id: `tav_${String(availabilitySeq++).padStart(26, '0')}` as TeacherAvailabilityId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    teacherId: TEACHER,
    weeklyWindows: { ...emptyWeek(), 1: [win('09:00', '12:00'), win('15:00', '18:00')] },
    ...over,
  };
}

let exceptionSeq = 1;
function makeException(over: Partial<TeacherAvailabilityException> = {}): TeacherAvailabilityException {
  return {
    id: `tae_${String(exceptionSeq++).padStart(26, '0')}` as TeacherAvailabilityExceptionId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    teacherId: TEACHER,
    dateRange: { start: '2026-10-01', end: '2026-10-15' },
    label: 'Omra',
    ...over,
  };
}

describe('SqliteTeacherAvailabilityRepository', () => {
  it('round-trips a weekly pattern (split windows + closed days) through save + findById', async () => {
    const availability = makeAvailability();
    await availabilityRepo.save(availability);
    expect(await availabilityRepo.findById(availability.id)).toEqual(availability);
  });

  it('findByTeacher resolves the live row for the teacher, tombstones excluded', async () => {
    const availability = makeAvailability();
    await availabilityRepo.save(availability);
    expect(await availabilityRepo.findByTeacher(CENTER, TEACHER)).toEqual(availability);
    expect(await availabilityRepo.findByTeacher(CENTER, OTHER_TEACHER)).toBeNull();

    await availabilityRepo.softDelete(availability.id, new Date('2026-04-01T00:00:00Z'), USER);
    expect(await availabilityRepo.findByTeacher(CENTER, TEACHER)).toBeNull();
  });

  it('listForCenter returns live rows only', async () => {
    await availabilityRepo.save(makeAvailability());
    const gone = makeAvailability({ teacherId: OTHER_TEACHER });
    await availabilityRepo.save(gone);
    await availabilityRepo.softDelete(gone.id, AT, USER);

    const rows = await availabilityRepo.listForCenter(CENTER);
    expect(rows.map((r) => r.teacherId)).toEqual([TEACHER]);
  });

  it('softDelete hides the row but keeps it in the sync feed', async () => {
    const availability = makeAvailability();
    await availabilityRepo.save(availability);
    await availabilityRepo.softDelete(availability.id, new Date('2026-04-01T00:00:00Z'), USER);

    expect(await availabilityRepo.findById(availability.id)).toBeNull();
    const changed = await availabilityRepo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-04-01T00:00:00Z'));
  });

  describe('DB constraints', () => {
    it('rejects an id without the tav_ prefix (CHECK)', async () => {
      await expect(
        availabilityRepo.save(makeAvailability({ id: 'bad_00000000000000000000000001' as TeacherAvailabilityId })),
      ).rejects.toThrow();
    });

    it('allows re-creating after the previous row is tombstoned', async () => {
      const first = makeAvailability();
      await availabilityRepo.save(first);
      await availabilityRepo.softDelete(first.id, AT, USER);
      await expect(availabilityRepo.save(makeAvailability())).resolves.toBeUndefined();
    });
  });

  describe('two-device convergence (qodo #4)', () => {
    // Inbound sync projects rows by id (`ON CONFLICT(id)`): when two devices
    // each created an availability row for the same teacher before their first
    // sync, BOTH rows must land without a constraint error, and every read must
    // resolve the same deterministic winner — greatest id, the same rule
    // `activeOverrideOn` uses — so the fleet converges instead of rejecting.
    it('accepts two live rows for one teacher and resolves the greatest id everywhere', async () => {
      const deviceA = makeAvailability({
        weeklyWindows: { ...emptyWeek(), 1: [win('09:00', '12:00')] },
      });
      const deviceB = makeAvailability({
        weeklyWindows: { ...emptyWeek(), 2: [win('14:00', '18:00')] },
      });
      await availabilityRepo.save(deviceA);
      await availabilityRepo.save(deviceB);

      const winner = await availabilityRepo.findByTeacher(CENTER, TEACHER);
      expect(winner?.id).toBe(deviceB.id);

      const listed = await availabilityRepo.listForCenter(CENTER);
      expect(listed.map((row) => row.id)).toEqual([deviceA.id, deviceB.id]);
    });
  });

  it('appends one change_log row per write with the nested domain payload', async () => {
    const availability = makeAvailability();
    await availabilityRepo.save(availability);
    await availabilityRepo.softDelete(availability.id, new Date('2026-04-01T00:00:00Z'), USER);

    const rows = db
      .prepare(
        "SELECT op, payload FROM change_log WHERE entity_type = 'teacher_availability' ORDER BY rowid",
      )
      .all() as { op: string; payload: string }[];
    expect(rows.map((r) => r.op)).toEqual(['create', 'delete']);
    const payload = JSON.parse(rows[0]!.payload) as {
      entity: { teacherId: string; weeklyWindows: Record<string, unknown> };
    };
    expect(payload.entity.teacherId).toBe(TEACHER);
    expect(payload.entity.weeklyWindows['1']).toEqual([
      { open: '09:00', close: '12:00' },
      { open: '15:00', close: '18:00' },
    ]);
    // The physical snake_case shape must NOT leak into the portable payload.
    expect(rows[0]!.payload).not.toContain('weekly_windows');
  });
});

describe('SqliteTeacherAvailabilityExceptionRepository', () => {
  it('round-trips an absence through save + findById', async () => {
    const exception = makeException();
    await exceptionRepo.save(exception);
    expect(await exceptionRepo.findById(exception.id)).toEqual(exception);
  });

  it('listForTeacher returns live rows of that teacher ordered by range start then id', async () => {
    await exceptionRepo.save(makeException({ dateRange: { start: '2026-11-01', end: '2026-11-05' } }));
    await exceptionRepo.save(makeException({ dateRange: { start: '2026-09-07', end: '2026-09-07' } }));
    await exceptionRepo.save(makeException({ teacherId: OTHER_TEACHER }));
    const gone = makeException({ dateRange: { start: '2026-08-01', end: '2026-08-02' } });
    await exceptionRepo.save(gone);
    await exceptionRepo.softDelete(gone.id, AT, USER);

    const rows = await exceptionRepo.listForTeacher(CENTER, TEACHER);
    expect(rows.map((r) => r.dateRange.start)).toEqual(['2026-09-07', '2026-11-01']);
  });

  describe('listOverlapping', () => {
    it('returns only absences intersecting the query window (inclusive bounds)', async () => {
      await exceptionRepo.save(makeException({ dateRange: { start: '2026-10-01', end: '2026-10-15' } }));
      await exceptionRepo.save(makeException({ dateRange: { start: '2027-01-01', end: '2027-01-10' } }));

      expect(await exceptionRepo.listOverlapping(CENTER, '2026-09-01', '2026-12-31')).toHaveLength(1);
      expect(await exceptionRepo.listOverlapping(CENTER, '2026-10-15', '2026-10-15')).toHaveLength(1);
      expect(await exceptionRepo.listOverlapping(CENTER, '2026-10-16', '2026-10-31')).toHaveLength(0);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the tae_ prefix (CHECK)', async () => {
      await expect(
        exceptionRepo.save(makeException({ id: 'bad_00000000000000000000000001' as TeacherAvailabilityExceptionId })),
      ).rejects.toThrow();
    });

    it('rejects an inverted date range (CHECK end_date >= start_date)', async () => {
      await expect(
        exceptionRepo.save(makeException({ dateRange: { start: '2026-10-15', end: '2026-10-01' } })),
      ).rejects.toThrow();
    });
  });

  it('logs the tombstoned domain entity on softDelete and rolls back with a failed save', async () => {
    const exception = makeException();
    await exceptionRepo.save(exception);
    await exceptionRepo.softDelete(exception.id, new Date('2026-04-01T00:00:00Z'), USER);

    const rows = db
      .prepare(
        "SELECT op, payload FROM change_log WHERE entity_type = 'teacher_availability_exceptions' ORDER BY rowid",
      )
      .all() as { op: string; payload: string }[];
    expect(rows.map((r) => r.op)).toEqual(['create', 'delete']);
    const last = JSON.parse(rows[1]!.payload) as { entity: { deletedAt: string | null } };
    expect(last.entity.deletedAt).toBe('2026-04-01T00:00:00.000Z');

    await expect(
      exceptionRepo.save(makeException({ dateRange: { start: '2026-10-15', end: '2026-10-01' } })),
    ).rejects.toThrow();
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM change_log WHERE entity_type = 'teacher_availability_exceptions'")
      .get() as { n: number };
    expect(count.n).toBe(2);
  });
});
