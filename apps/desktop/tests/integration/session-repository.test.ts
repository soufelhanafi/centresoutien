import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Session,
  SessionId,
  WeeklyRecurringSessionId,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  RoomId,
  GroupId,
  GenerationBatchId,
  TimeOfDay,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteSessionRepository } from '../../src/data/sqlite/repositories/session-repository';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER_A = 'tch_00000000000000000000000001' as EntityId;
const GROUP_A = 'grp_00000000000000000000000001' as GroupId;
const GROUP_B = 'grp_00000000000000000000000002' as GroupId;
const WRS_A = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const WRS_B = 'wrs_00000000000000000000000002' as WeeklyRecurringSessionId;

let dir: string;
let db: DB;
let repo: SqliteSessionRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-ses-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteSessionRepository(
    db,
    new SqliteChangeLogWriter(
      db,
      { now: () => new Date('2026-07-29T10:00:00Z') },
      DEVICE,
    ),
  );
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeSession(over: Partial<Session> = {}): Session {
  seq += 1;
  return {
    id: `ses_${String(seq).padStart(26, '0')}` as SessionId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    recurringSessionId: WRS_A,
    generationBatchId: null,
    roomId: ROOM_A,
    teacherId: TEACHER_A,
    groupId: GROUP_A,
    date: '2026-01-08',
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

describe('SqliteSessionRepository', () => {
  describe('save + findById', () => {
    it('round-trips a session with all fields intact', async () => {
      const session = makeSession({ date: '2026-03-05', start: '14:30' as TimeOfDay, end: '16:00' as TimeOfDay });
      await repo.save(session);
      expect(await repo.findById(session.id)).toEqual(session);
    });

    it('preserves a null teacher', async () => {
      const session = makeSession({ teacherId: null });
      await repo.save(session);
      expect((await repo.findById(session.id))?.teacherId).toBeNull();
    });

    it('preserves a null group (SOU-130)', async () => {
      const session = makeSession({ groupId: null });
      await repo.save(session);
      expect((await repo.findById(session.id))?.groupId).toBeNull();
    });

    it('round-trips a generationBatchId (SOU-160)', async () => {
      const batchId = 'gen_00000000000000000000000001' as GenerationBatchId;
      const session = makeSession({ generationBatchId: batchId });
      await repo.save(session);
      expect((await repo.findById(session.id))?.generationBatchId).toBe(batchId);
    });

    it('findById returns null for an unknown id', async () => {
      expect(await repo.findById('ses_00000000000000000000000099' as SessionId)).toBeNull();
    });

    it('upsert on id updates mutable fields + version but not identity', async () => {
      const session = makeSession();
      await repo.save(session);
      await repo.save(
        makeSession({
          id: session.id,
          roomId: ROOM_B,
          teacherId: null,
          groupId: GROUP_B,
          start: '11:00' as TimeOfDay,
          end: '12:30' as TimeOfDay,
          version: 3,
          updatedAt: new Date('2026-08-01T09:00:00Z'),
        }),
      );
      const found = await repo.findById(session.id);
      expect(found?.roomId).toBe(ROOM_B);
      expect(found?.teacherId).toBeNull();
      expect(found?.groupId).toBe(GROUP_B);
      expect(found?.version).toBe(3);
      expect(found?.createdAt).toEqual(AT);
      expect(found?.deviceOrigin).toBe(DEVICE);
    });
  });

  describe('softDelete', () => {
    it('hides the row from findById but keeps it as a tombstone in listChangedSince', async () => {
      const session = makeSession();
      await repo.save(session);
      await repo.softDelete(session.id, new Date('2026-08-02T00:00:00Z'), USER);

      expect(await repo.findById(session.id)).toBeNull();
      const changed = await repo.listChangedSince(AT);
      expect(changed).toHaveLength(1);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
      expect(changed[0]?.updatedBy).toBe(USER);
    });
  });

  describe('upsertMany (idempotent generation)', () => {
    const window = (): readonly Session[] => [
      makeSession({ date: '2026-01-01' }),
      makeSession({ date: '2026-01-08' }),
      makeSession({ date: '2026-01-15' }),
    ];

    it('re-running the same window yields exactly one row set — no duplicates', async () => {
      await repo.upsertMany(window());
      // Second run: fresh ULIDs for the same (recurringSessionId, date) pairs.
      await repo.upsertMany(window());

      const stored = await repo.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' });
      expect(stored.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    });

    it('keeps the original row untouched on conflict (no updated_at / version churn)', async () => {
      const original = makeSession({ date: '2026-01-01', updatedAt: AT, version: 0 });
      await repo.upsertMany([original]);

      // A re-run offers a fresh ULID + a later updatedAt + a bumped version.
      await repo.upsertMany([
        makeSession({ date: '2026-01-01', updatedAt: new Date('2026-09-01T00:00:00Z'), version: 9 }),
      ]);

      const stored = await repo.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.id).toBe(original.id); // original id preserved
      expect(stored[0]?.updatedAt).toEqual(AT); // NOT bumped → no phantom sync
      expect(stored[0]?.version).toBe(0);
    });

    it('a widened window inserts only the newly-covered dates', async () => {
      await repo.upsertMany([makeSession({ date: '2026-01-01' }), makeSession({ date: '2026-01-08' })]);
      await repo.upsertMany(window()); // adds 2026-01-15

      const dates = (await repo.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' })).map((s) => s.date);
      expect(dates).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    });

    it('never resurrects a cancelled occurrence', async () => {
      const first = makeSession({ date: '2026-01-01' });
      await repo.upsertMany([first]);
      await repo.softDelete(first.id, new Date('2026-01-02T00:00:00Z'), USER);

      // Regenerate the same date — the tombstone still occupies the natural-key slot.
      await repo.upsertMany([makeSession({ date: '2026-01-01' })]);

      expect(await repo.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' })).toEqual([]);
      // And no duplicate live row snuck in behind the tombstone.
      const forRecurrence = await repo.listForRecurrence(WRS_A);
      expect(forRecurrence).toEqual([]);
    });

    it('different recurrences may share the same date', async () => {
      await repo.upsertMany([
        makeSession({ recurringSessionId: WRS_A, date: '2026-01-01' }),
        makeSession({ recurringSessionId: WRS_B, date: '2026-01-01' }),
      ]);
      expect(await repo.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-01' })).toHaveLength(2);
    });
  });

  describe('listForRange', () => {
    it('returns live occurrences in the window, ordered by date then start, excluding tombstones + other centers', async () => {
      await repo.save(makeSession({ date: '2026-01-15', start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay }));
      // Two recurrences land on 2026-01-08 — distinct natural keys, so the row ordering
      // within the day (by start) is what's under test.
      await repo.save(makeSession({ recurringSessionId: WRS_A, date: '2026-01-08', start: '11:00' as TimeOfDay, end: '12:00' as TimeOfDay }));
      await repo.save(makeSession({ recurringSessionId: WRS_B, date: '2026-01-08', start: '08:00' as TimeOfDay, end: '09:00' as TimeOfDay }));
      await repo.save(makeSession({ date: '2026-02-01' })); // out of window
      const gone = makeSession({ date: '2026-01-10' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeSession({ date: '2026-01-09', centerCode: OTHER_CENTER, recurringSessionId: WRS_B }));

      const inRange = await repo.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' });
      expect(inRange.map((s) => [s.date, s.start])).toEqual([
        ['2026-01-08', '08:00'],
        ['2026-01-08', '11:00'],
        ['2026-01-15', '09:00'],
      ]);
    });

    it('boundaries are inclusive', async () => {
      await repo.save(makeSession({ date: '2026-01-01' }));
      await repo.save(makeSession({ date: '2026-01-31', recurringSessionId: WRS_B }));
      expect((await repo.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' })).map((s) => s.date)).toEqual([
        '2026-01-01',
        '2026-01-31',
      ]);
    });
  });

  describe('listForRecurrence', () => {
    it('returns a recurrence\'s live occurrences ordered by date, excluding tombstones + other recurrences', async () => {
      await repo.save(makeSession({ recurringSessionId: WRS_A, date: '2026-01-15' }));
      await repo.save(makeSession({ recurringSessionId: WRS_A, date: '2026-01-08' }));
      await repo.save(makeSession({ recurringSessionId: WRS_B, date: '2026-01-09' }));
      const gone = makeSession({ recurringSessionId: WRS_A, date: '2026-01-22' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);

      const list = await repo.listForRecurrence(WRS_A);
      expect(list.map((s) => s.date)).toEqual(['2026-01-08', '2026-01-15']);
    });
  });

  describe('listByGenerationBatch', () => {
    const BATCH_A = 'gen_00000000000000000000000001' as GenerationBatchId;
    const BATCH_B = 'gen_00000000000000000000000002' as GenerationBatchId;

    it('returns live occurrences sharing the batch id, ordered by date then start, excluding tombstones + other centers', async () => {
      await repo.save(makeSession({ generationBatchId: BATCH_A, date: '2026-01-15' }));
      await repo.save(
        makeSession({ generationBatchId: BATCH_A, recurringSessionId: WRS_B, date: '2026-01-08' }),
      );
      await repo.save(makeSession({ generationBatchId: BATCH_B, date: '2026-02-01' })); // different batch
      const gone = makeSession({ generationBatchId: BATCH_A, date: '2026-01-10' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(
        makeSession({ generationBatchId: BATCH_A, centerCode: OTHER_CENTER, recurringSessionId: WRS_B, date: '2026-01-09' }),
      );

      const inBatch = await repo.listByGenerationBatch(CENTER, BATCH_A);
      expect(inBatch.map((s) => s.date)).toEqual(['2026-01-08', '2026-01-15']);
    });

    it('returns nothing for an unknown batch id', async () => {
      expect(await repo.listByGenerationBatch(CENTER, BATCH_A)).toEqual([]);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the ses_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeSession({ id: 'bad_00000000000000000000000001' as SessionId })),
      ).rejects.toThrow();
    });

    it('rejects an end_time not strictly after start_time (CHECK)', async () => {
      await expect(
        repo.save(makeSession({ start: '10:00' as TimeOfDay, end: '10:00' as TimeOfDay })),
      ).rejects.toThrow();
    });

    it('rejects a second row on the same (recurring_session_id, date) via save (UNIQUE)', async () => {
      await repo.save(makeSession({ recurringSessionId: WRS_A, date: '2026-01-01' }));
      await expect(
        repo.save(makeSession({ recurringSessionId: WRS_A, date: '2026-01-01' })),
      ).rejects.toThrow();
    });
  });
});
