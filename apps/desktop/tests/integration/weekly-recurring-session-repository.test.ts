import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  RoomId,
  TimeOfDay,
  WeekdayIndex,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteWeeklyRecurringSessionRepository } from '../../src/data/sqlite/repositories/weekly-recurring-session-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER_A = 'tch_00000000000000000000000001' as EntityId;

let dir: string;
let db: DB;
let repo: SqliteWeeklyRecurringSessionRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-wrs-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteWeeklyRecurringSessionRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeSession(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    roomId: ROOM_A,
    teacherId: TEACHER_A,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:00' as TimeOfDay,
    ...over,
  };
}

describe('SqliteWeeklyRecurringSessionRepository', () => {
  it('round-trips a session through save + findById with all fields intact', async () => {
    const session = makeSession({ dayOfWeek: 3 as WeekdayIndex, start: '14:30' as TimeOfDay, end: '16:00' as TimeOfDay });
    await repo.save(session);
    expect(await repo.findById(session.id)).toEqual(session);
  });

  it('round-trips a session with no teacher (null preserved)', async () => {
    const session = makeSession({ teacherId: null });
    await repo.save(session);
    expect((await repo.findById(session.id))?.teacherId).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('wrs_00000000000000000000000099' as WeeklyRecurringSessionId)).toBeNull();
  });

  it('upsert updates mutable fields + version but not identity on a second save', async () => {
    const session = makeSession();
    await repo.save(session);
    await repo.save(
      makeSession({
        id: session.id,
        roomId: ROOM_B,
        teacherId: null,
        dayOfWeek: 5 as WeekdayIndex,
        start: '11:00' as TimeOfDay,
        end: '12:30' as TimeOfDay,
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById(session.id);
    expect(found?.roomId).toBe(ROOM_B);
    expect(found?.teacherId).toBeNull();
    expect(found?.version).toBe(3);
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.deviceOrigin).toBe('dev_00000000000000000000000001');
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const session = makeSession();
    await repo.save(session);
    await repo.softDelete(session.id, new Date('2026-08-02T00:00:00Z'), USER);

    expect(await repo.findById(session.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeSession({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      const later = makeSession({ updatedAt: new Date('2026-07-20T00:00:00Z') });
      await repo.save(later);

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((s) => s.id)).toEqual([later.id]);
    });
  });

  describe('listForWeek', () => {
    it('returns live sessions of the center ordered by weekday then start, excluding tombstones + other centers', async () => {
      await repo.save(makeSession({ dayOfWeek: 3 as WeekdayIndex, start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay }));
      await repo.save(makeSession({ dayOfWeek: 1 as WeekdayIndex, start: '11:00' as TimeOfDay, end: '12:00' as TimeOfDay }));
      await repo.save(makeSession({ dayOfWeek: 1 as WeekdayIndex, start: '08:00' as TimeOfDay, end: '09:00' as TimeOfDay }));
      const gone = makeSession({ dayOfWeek: 2 as WeekdayIndex });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeSession({ centerCode: OTHER_CENTER, dayOfWeek: 1 as WeekdayIndex }));

      const week = await repo.listForWeek(CENTER);
      expect(week.map((s) => [s.dayOfWeek, s.start])).toEqual([
        [1, '08:00'],
        [1, '11:00'],
        [3, '09:00'],
      ]);
    });
  });

  describe('listRefsForDay', () => {
    it('returns pre-scoped conflict refs for the weekday: same center, alive, that day', async () => {
      const onDay = makeSession({ dayOfWeek: 2 as WeekdayIndex });
      await repo.save(onDay);
      await repo.save(makeSession({ dayOfWeek: 4 as WeekdayIndex })); // other day
      const gone = makeSession({ dayOfWeek: 2 as WeekdayIndex });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER); // tombstone
      await repo.save(makeSession({ dayOfWeek: 2 as WeekdayIndex, centerCode: OTHER_CENTER })); // other center

      const refs = await repo.listRefsForDay(CENTER, 2 as WeekdayIndex);
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        id: onDay.id,
        roomId: ROOM_A,
        teacherId: TEACHER_A,
        dayOfWeek: 2,
        start: '09:00',
        end: '10:00',
      });
    });

    it('omits teacherId entirely on a teacher-less session', async () => {
      await repo.save(makeSession({ dayOfWeek: 2 as WeekdayIndex, teacherId: null }));
      const refs = await repo.listRefsForDay(CENTER, 2 as WeekdayIndex);
      expect(refs[0]).not.toHaveProperty('teacherId');
    });
  });

  describe('hasActiveSessionForRoom (RoomReferencePort)', () => {
    it('is true while a live session books the room and false once it is tombstoned', async () => {
      const session = makeSession({ roomId: ROOM_A });
      await repo.save(session);
      expect(await repo.hasActiveSessionForRoom(ROOM_A)).toBe(true);
      expect(await repo.hasActiveSessionForRoom(ROOM_B)).toBe(false);

      await repo.softDelete(session.id, AT, USER);
      expect(await repo.hasActiveSessionForRoom(ROOM_A)).toBe(false);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the wrs_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeSession({ id: 'bad_00000000000000000000000001' as WeeklyRecurringSessionId })),
      ).rejects.toThrow();
    });

    it('rejects a day_of_week outside 0..6 (CHECK)', async () => {
      await expect(repo.save(makeSession({ dayOfWeek: 7 as WeekdayIndex }))).rejects.toThrow();
    });

    it('rejects an end_time not strictly after start_time (CHECK)', async () => {
      await expect(
        repo.save(makeSession({ start: '10:00' as TimeOfDay, end: '10:00' as TimeOfDay })),
      ).rejects.toThrow();
    });
  });

  describe('conflict-query performance', () => {
    it('listRefsForDay returns in <10ms on a 500-row dataset', async () => {
      const insertMany = db.transaction((sessions: readonly WeeklyRecurringSession[]) => {
        for (const s of sessions) void repo.save(s);
      });
      // 500 rows spread across all 7 weekdays and both rooms.
      const dataset = Array.from({ length: 500 }, (_, i) =>
        makeSession({
          dayOfWeek: (i % 7) as WeekdayIndex,
          roomId: i % 2 === 0 ? ROOM_A : ROOM_B,
        }),
      );
      insertMany(dataset);

      const started = performance.now();
      const refs = await repo.listRefsForDay(CENTER, 3 as WeekdayIndex);
      const elapsed = performance.now() - started;

      expect(refs.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(10);
    });
  });
});
