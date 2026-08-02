import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  AttendanceRecord,
  AttendanceRecordId,
  Session,
  SessionId,
  WeeklyRecurringSessionId,
  CenterCode,
  DeviceId,
  UserId,
  RoomId,
  TimeOfDay,
  StudentId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteAttendanceRepository } from '../../src/data/sqlite/repositories/attendance-repository';
import { SqliteSessionRepository } from '../../src/data/sqlite/repositories/session-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const WRS = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_B = 'stu_00000000000000000000000002' as StudentId;

let dir: string;
let db: DB;
let repo: SqliteAttendanceRepository;
let sessions: SqliteSessionRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-att-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteAttendanceRepository(db);
  sessions = new SqliteSessionRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let sessionSeq = 0;
async function makeSession(date: string): Promise<SessionId> {
  sessionSeq += 1;
  const session: Session = {
    id: `ses_${String(sessionSeq).padStart(26, '0')}` as SessionId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    recurringSessionId: WRS,
    roomId: ROOM,
    teacherId: null,
    date,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
  };
  await sessions.save(session);
  return session.id;
}

let seq = 0;
function makeAttendance(over: Partial<AttendanceRecord> & { sessionId: SessionId; studentId: StudentId }): AttendanceRecord {
  seq += 1;
  return {
    id: `att_${String(seq).padStart(26, '0')}` as AttendanceRecordId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    status: 'present',
    note: null,
    ...over,
  };
}

describe('SqliteAttendanceRepository', () => {
  describe('save + findById', () => {
    it('round-trips a record with all fields intact', async () => {
      const sessionId = await makeSession('2026-01-08');
      const record = makeAttendance({ sessionId, studentId: STUDENT_A, status: 'late', note: '10 min de retard' });
      await repo.save(record);
      expect(await repo.findById(record.id)).toEqual(record);
    });

    it('preserves a null note', async () => {
      const sessionId = await makeSession('2026-01-08');
      const record = makeAttendance({ sessionId, studentId: STUDENT_A, note: null });
      await repo.save(record);
      expect((await repo.findById(record.id))?.note).toBeNull();
    });

    it('findById returns null for an unknown id', async () => {
      expect(await repo.findById('att_00000000000000000000000099' as AttendanceRecordId)).toBeNull();
    });

    it('upsert on id corrects status + note but not identity (same-day roll-call correction)', async () => {
      const sessionId = await makeSession('2026-01-08');
      const record = makeAttendance({ sessionId, studentId: STUDENT_A, status: 'absent' });
      await repo.save(record);

      await repo.save({
        ...record,
        status: 'present',
        note: 'Arrivé en retard, présence confirmée',
        version: 1,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      });

      const found = await repo.findById(record.id);
      expect(found?.status).toBe('present');
      expect(found?.note).toBe('Arrivé en retard, présence confirmée');
      expect(found?.version).toBe(1);
      expect(found?.createdAt).toEqual(AT);
      expect(found?.sessionId).toBe(sessionId);
      expect(found?.studentId).toBe(STUDENT_A);
    });
  });

  describe('softDelete', () => {
    it('hides the row from findById but keeps it as a tombstone in listChangedSince', async () => {
      const sessionId = await makeSession('2026-01-08');
      const record = makeAttendance({ sessionId, studentId: STUDENT_A });
      await repo.save(record);
      await repo.softDelete(record.id, new Date('2026-08-02T00:00:00Z'), USER);

      expect(await repo.findById(record.id)).toBeNull();
      const changed = await repo.listChangedSince(AT);
      expect(changed).toHaveLength(1);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
      expect(changed[0]?.updatedBy).toBe(USER);
    });
  });

  describe('saveMany', () => {
    it('upserts a whole batch in one transaction', async () => {
      const sessionId = await makeSession('2026-01-08');
      const batch = [
        makeAttendance({ sessionId, studentId: STUDENT_A, status: 'present' }),
        makeAttendance({ sessionId, studentId: STUDENT_B, status: 'absent' }),
      ];

      await repo.saveMany(batch);

      const roster = await repo.listBySession(sessionId);
      expect(roster.map((r) => [r.studentId, r.status])).toEqual([
        [STUDENT_A, 'present'],
        [STUDENT_B, 'absent'],
      ]);
    });

    it('rolls back the whole batch when one row violates a CHECK constraint', async () => {
      const sessionId = await makeSession('2026-01-08');
      const batch = [
        makeAttendance({ sessionId, studentId: STUDENT_A, status: 'present' }),
        makeAttendance({
          sessionId,
          studentId: STUDENT_B,
          status: 'tardy' as unknown as AttendanceRecord['status'],
        }),
      ];

      await expect(repo.saveMany(batch)).rejects.toThrow();
      expect(await repo.listBySession(sessionId)).toEqual([]);
    });
  });

  describe('listBySession', () => {
    it('returns live records for the session, ordered by studentId, excluding tombstones', async () => {
      const sessionId = await makeSession('2026-01-08');
      const otherSessionId = await makeSession('2026-01-09');
      await repo.save(makeAttendance({ sessionId, studentId: STUDENT_B, status: 'absent' }));
      await repo.save(makeAttendance({ sessionId, studentId: STUDENT_A, status: 'present' }));
      const gone = makeAttendance({ sessionId, studentId: STUDENT_B, status: 'late' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeAttendance({ sessionId: otherSessionId, studentId: STUDENT_A, status: 'excused' }));

      const roster = await repo.listBySession(sessionId);
      expect(roster.map((r) => [r.studentId, r.status])).toEqual([
        [STUDENT_A, 'present'],
        [STUDENT_B, 'absent'],
      ]);
    });

    it('returns an empty roster for a session with no records', async () => {
      const sessionId = await makeSession('2026-01-08');
      expect(await repo.listBySession(sessionId)).toEqual([]);
    });
  });

  describe('summarizeForStudent', () => {
    it('counts each status within the range, defaulting missing statuses to 0', async () => {
      const s1 = await makeSession('2026-01-05');
      const s2 = await makeSession('2026-01-12');
      const s3 = await makeSession('2026-01-19');
      await repo.save(makeAttendance({ sessionId: s1, studentId: STUDENT_A, status: 'present' }));
      await repo.save(makeAttendance({ sessionId: s2, studentId: STUDENT_A, status: 'absent' }));
      await repo.save(makeAttendance({ sessionId: s3, studentId: STUDENT_A, status: 'absent' }));

      const summary = await repo.summarizeForStudent(STUDENT_A, { start: '2026-01-01', end: '2026-01-31' });
      expect(summary).toEqual({ present: 1, absent: 2, excused: 0, late: 0 });
    });

    it('excludes sessions outside the range', async () => {
      const inRange = await makeSession('2026-01-15');
      const outOfRange = await makeSession('2026-02-01');
      await repo.save(makeAttendance({ sessionId: inRange, studentId: STUDENT_A, status: 'present' }));
      await repo.save(makeAttendance({ sessionId: outOfRange, studentId: STUDENT_A, status: 'absent' }));

      const summary = await repo.summarizeForStudent(STUDENT_A, { start: '2026-01-01', end: '2026-01-31' });
      expect(summary).toEqual({ present: 1, absent: 0, excused: 0, late: 0 });
    });

    it('excludes tombstoned records', async () => {
      const sessionId = await makeSession('2026-01-15');
      const record = makeAttendance({ sessionId, studentId: STUDENT_A, status: 'absent' });
      await repo.save(record);
      await repo.softDelete(record.id, AT, USER);

      const summary = await repo.summarizeForStudent(STUDENT_A, { start: '2026-01-01', end: '2026-01-31' });
      expect(summary).toEqual({ present: 0, absent: 0, excused: 0, late: 0 });
    });

    it('excludes other students', async () => {
      const sessionId = await makeSession('2026-01-15');
      await repo.save(makeAttendance({ sessionId, studentId: STUDENT_B, status: 'absent' }));

      const summary = await repo.summarizeForStudent(STUDENT_A, { start: '2026-01-01', end: '2026-01-31' });
      expect(summary).toEqual({ present: 0, absent: 0, excused: 0, late: 0 });
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the att_ prefix (CHECK)', async () => {
      const sessionId = await makeSession('2026-01-08');
      await expect(
        repo.save(makeAttendance({ sessionId, studentId: STUDENT_A, id: 'bad_00000000000000000000000001' as AttendanceRecordId })),
      ).rejects.toThrow();
    });

    it('rejects a status outside the enum (CHECK)', async () => {
      const sessionId = await makeSession('2026-01-08');
      await expect(
        repo.save(makeAttendance({ sessionId, studentId: STUDENT_A, status: 'tardy' as unknown as AttendanceRecord['status'] })),
      ).rejects.toThrow();
    });

    it('allows two live records for the same (session, student) pair — no UNIQUE (sync convergence)', async () => {
      const sessionId = await makeSession('2026-01-08');
      await repo.save(makeAttendance({ sessionId, studentId: STUDENT_A, status: 'present' }));
      await expect(
        repo.save(makeAttendance({ sessionId, studentId: STUDENT_A, status: 'absent' })),
      ).resolves.not.toThrow();
    });
  });
});
