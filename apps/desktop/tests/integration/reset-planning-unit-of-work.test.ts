import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  AttendanceRecord,
  AttendanceRecordId,
  ChangeLogWriter,
  Session,
  SessionId,
  StudentId,
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  RoomId,
  GroupId,
  TimeOfDay,
  WeekdayIndex,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteSessionRepository } from '../../src/data/sqlite/repositories/session-repository';
import { SqliteAttendanceRepository } from '../../src/data/sqlite/repositories/attendance-repository';
import { SqliteWeeklyRecurringSessionRepository } from '../../src/data/sqlite/repositories/weekly-recurring-session-repository';
import { SqliteResetPlanningUnitOfWork } from '../../src/data/sqlite/repositories/reset-planning-unit-of-work';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const ADMIN = 'usr_00000000000000000000000002' as UserId;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const WRS = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const AT = new Date('2026-08-01T10:00:00Z');
const DELETED_AT = new Date('2026-08-15T09:00:00Z');
const CUTOFF = '2026-08-15';

let dir: string;
let db: DB;
let sessionRepo: SqliteSessionRepository;
let templateRepo: SqliteWeeklyRecurringSessionRepository;
let attendanceRepo: SqliteAttendanceRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-reset-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  const changeLog = changeLogWriterForTest(db);
  sessionRepo = new SqliteSessionRepository(db, changeLog);
  templateRepo = new SqliteWeeklyRecurringSessionRepository(db, changeLog);
  attendanceRepo = new SqliteAttendanceRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

let sessionSeq = 0;
function makeSession(over: Partial<Session> = {}): Session {
  sessionSeq += 1;
  return {
    id: `ses_${String(sessionSeq).padStart(26, '0')}` as SessionId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    recurringSessionId: WRS,
    generationBatchId: null,
    roomId: ROOM,
    teacherId: TEACHER,
    groupId: GROUP,
    date: '2026-08-20',
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

let templateSeq = 0;
function makeTemplate(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  templateSeq += 1;
  return {
    id: `wrs_${String(templateSeq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    roomId: ROOM,
    teacherId: TEACHER,
    groupId: GROUP,
    dayOfWeek: 3 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    conflictAccepted: false,
    ...over,
  };
}

let attendanceSeq = 0;
function makeAttendance(sessionId: SessionId): AttendanceRecord {
  attendanceSeq += 1;
  return {
    id: `att_${String(attendanceSeq).padStart(26, '0')}` as AttendanceRecordId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    sessionId,
    studentId: STUDENT,
    status: 'present',
    note: null,
  };
}

function deleteLogCount(entityType: string): number {
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM change_log WHERE entity_type = ? AND op = 'delete'")
    .get(entityType) as { n: number };
  return n;
}

describe('SqliteSessionRepository.listLiveFrom', () => {
  it('returns live occurrences on or after the cutoff, ordered by date then start, excluding past + tombstones + other centers', async () => {
    await sessionRepo.save(makeSession({ date: '2026-08-01' })); // past
    await sessionRepo.save(makeSession({ recurringSessionId: WRS, date: '2026-08-15', start: '11:00' as TimeOfDay, end: '12:00' as TimeOfDay }));
    const early = makeSession({ recurringSessionId: 'wrs_00000000000000000000000002' as WeeklyRecurringSessionId, date: '2026-08-15', start: '08:00' as TimeOfDay, end: '09:00' as TimeOfDay });
    await sessionRepo.save(early);
    await sessionRepo.save(makeSession({ date: '2026-09-01' }));
    const gone = makeSession({ date: '2026-08-20' });
    await sessionRepo.save(gone);
    await sessionRepo.softDelete(gone.id, DELETED_AT, USER);
    await sessionRepo.save(makeSession({ date: '2026-08-25', centerCode: OTHER_CENTER, recurringSessionId: 'wrs_00000000000000000000000003' as WeeklyRecurringSessionId }));

    const live = await sessionRepo.listLiveFrom(CENTER, CUTOFF);

    expect(live.map((s) => [s.date, s.start])).toEqual([
      ['2026-08-15', '08:00'],
      ['2026-08-15', '11:00'],
      ['2026-09-01', '09:00'],
    ]);
  });

  it('excludes a cutoff-day session that already has a live attendance record — but keeps it once that attendance is tombstoned', async () => {
    const attendedToday = makeSession({ date: CUTOFF, start: '08:00' as TimeOfDay, end: '09:00' as TimeOfDay });
    await sessionRepo.save(attendedToday);
    const attendance = makeAttendance(attendedToday.id);
    await attendanceRepo.save(attendance);
    const unattendedFuture = makeSession({ recurringSessionId: 'wrs_00000000000000000000000002' as WeeklyRecurringSessionId, date: '2026-08-20' });
    await sessionRepo.save(unattendedFuture);

    const live = await sessionRepo.listLiveFrom(CENTER, CUTOFF);
    expect(live.map((s) => s.id)).toEqual([unattendedFuture.id]);

    await attendanceRepo.softDelete(attendance.id, DELETED_AT, USER);
    const afterAttendanceRemoved = await sessionRepo.listLiveFrom(CENTER, CUTOFF);
    expect(afterAttendanceRemoved.map((s) => s.id)).toEqual([attendedToday.id, unattendedFuture.id]);
  });
});

describe('ResetPlanning selection preserves attended sessions (SOU-295)', () => {
  it('tombstones the unattended future session but never the attended cutoff-day one, and its attendance survives', async () => {
    const attendedToday = makeSession({ date: CUTOFF, start: '08:00' as TimeOfDay, end: '09:00' as TimeOfDay });
    await sessionRepo.save(attendedToday);
    const attendance = makeAttendance(attendedToday.id);
    await attendanceRepo.save(attendance);
    const unattendedFuture = makeSession({ recurringSessionId: 'wrs_00000000000000000000000002' as WeeklyRecurringSessionId, date: '2026-08-20' });
    await sessionRepo.save(unattendedFuture);

    const toClear = await sessionRepo.listLiveFrom(CENTER, CUTOFF);
    const unitOfWork = new SqliteResetPlanningUnitOfWork(db, changeLogWriterForTest(db));
    await unitOfWork.commit({
      sessions: toClear,
      templates: [],
      deletedAt: DELETED_AT,
      updatedBy: ADMIN,
    });

    expect(toClear.length).toBe(1);
    expect(await sessionRepo.findById(unattendedFuture.id)).toBeNull();
    expect(await sessionRepo.findById(attendedToday.id)).not.toBeNull();
    const survivingAttendance = await attendanceRepo.listBySession(attendedToday.id);
    expect(survivingAttendance.map((a) => a.id)).toEqual([attendance.id]);
  });
});

describe('SqliteWeeklyRecurringSessionRepository.listActive', () => {
  it('returns every live template of the center, ordered by weekday then start, excluding tombstones + other centers', async () => {
    await templateRepo.save(makeTemplate({ dayOfWeek: 4 as WeekdayIndex, start: '09:00' as TimeOfDay }));
    await templateRepo.save(makeTemplate({ dayOfWeek: 1 as WeekdayIndex, start: '14:00' as TimeOfDay, end: '15:00' as TimeOfDay }));
    const gone = makeTemplate({ dayOfWeek: 2 as WeekdayIndex });
    await templateRepo.save(gone);
    await templateRepo.softDelete(gone.id, DELETED_AT, USER);
    await templateRepo.save(makeTemplate({ centerCode: OTHER_CENTER, dayOfWeek: 0 as WeekdayIndex }));

    const active = await templateRepo.listActive(CENTER);

    expect(active.map((t) => t.dayOfWeek)).toEqual([1, 4]);
  });
});

describe('SqliteResetPlanningUnitOfWork', () => {
  it('soft-deletes every session + template atomically and logs one delete row each', async () => {
    const future = makeSession({ date: '2026-08-20' });
    await sessionRepo.save(future);
    const template = makeTemplate();
    await templateRepo.save(template);

    const unitOfWork = new SqliteResetPlanningUnitOfWork(db, changeLogWriterForTest(db));
    await unitOfWork.commit({
      sessions: [future],
      templates: [template],
      deletedAt: DELETED_AT,
      updatedBy: ADMIN,
    });

    expect(await sessionRepo.findById(future.id)).toBeNull();
    expect(await templateRepo.findById(template.id)).toBeNull();
    const [tombstone] = await sessionRepo.listChangedSince(AT);
    expect(tombstone?.deletedAt).toEqual(DELETED_AT);
    expect(tombstone?.updatedBy).toBe(ADMIN);
    expect(deleteLogCount('sessions')).toBe(1);
    expect(deleteLogCount('weekly_recurring_sessions')).toBe(1);
  });

  it('rolls BOTH sets back when a write partway through throws — no partial wipe', async () => {
    const future = makeSession({ date: '2026-08-20' });
    await sessionRepo.save(future);
    const template = makeTemplate();
    await templateRepo.save(template);

    let records = 0;
    const failingChangeLog: ChangeLogWriter = {
      record: (input) => {
        records += 1;
        if (records === 2) throw new Error('change-log append failed');
        changeLogWriterForTest(db).record(input);
      },
    };
    const unitOfWork = new SqliteResetPlanningUnitOfWork(db, failingChangeLog);

    await expect(
      unitOfWork.commit({
        sessions: [future],
        templates: [template],
        deletedAt: DELETED_AT,
        updatedBy: ADMIN,
      }),
    ).rejects.toThrow('change-log append failed');

    expect(await sessionRepo.findById(future.id)).not.toBeNull();
    expect(await templateRepo.findById(template.id)).not.toBeNull();
    expect(deleteLogCount('sessions')).toBe(0);
    expect(deleteLogCount('weekly_recurring_sessions')).toBe(0);
  });

  it('never hard-deletes — rows survive as tombstones', async () => {
    const future = makeSession({ date: '2026-08-20' });
    await sessionRepo.save(future);
    const template = makeTemplate();
    await templateRepo.save(template);

    const unitOfWork = new SqliteResetPlanningUnitOfWork(db, changeLogWriterForTest(db));
    await unitOfWork.commit({
      sessions: [future],
      templates: [template],
      deletedAt: DELETED_AT,
      updatedBy: ADMIN,
    });

    const sessionRows = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    const templateRows = db.prepare('SELECT COUNT(*) AS n FROM weekly_recurring_sessions').get() as { n: number };
    expect(sessionRows.n).toBe(1);
    expect(templateRows.n).toBe(1);
  });
});
