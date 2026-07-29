import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  CenterHours,
  CenterHoursId,
  CenterCode,
  DeviceId,
  UserId,
  TimeOfDay,
  WeekdayIndex,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteCenterHoursRepository } from '../../src/data/sqlite/repositories/center-hours-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const AT = new Date('2026-07-29T10:00:00Z');

let dir: string;
let db: DB;
let repo: SqliteCenterHoursRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-hours-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteCenterHoursRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

let seq = 1;
function makeHours(over: Partial<CenterHours> = {}): CenterHours {
  return {
    id: `chr_${String(seq++).padStart(26, '0')}` as CenterHoursId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    dayOfWeek: 1 as WeekdayIndex,
    open: '09:00' as TimeOfDay,
    close: '18:00' as TimeOfDay,
    ...over,
  };
}

describe('SqliteCenterHoursRepository', () => {
  it('round-trips an open weekday through save + findById', async () => {
    const hours = makeHours();
    await repo.save(hours);
    expect(await repo.findById(hours.id)).toEqual(hours);
  });

  it('round-trips a closed day (open/close null)', async () => {
    const hours = makeHours({ dayOfWeek: 0 as WeekdayIndex, open: null, close: null });
    await repo.save(hours);
    const found = await repo.findById(hours.id);
    expect(found?.open).toBeNull();
    expect(found?.close).toBeNull();
  });

  it('upsert updates times on a second save of the same id', async () => {
    const hours = makeHours();
    await repo.save(hours);
    await repo.save({ ...hours, open: '08:00' as TimeOfDay, version: 2 });
    const found = await repo.findById(hours.id);
    expect(found?.open).toBe('08:00');
    expect(found?.version).toBe(2);
  });

  it('softDelete hides the row but keeps it in the sync feed', async () => {
    const hours = makeHours();
    await repo.save(hours);
    await repo.softDelete(hours.id, new Date('2026-08-02T00:00:00Z'));

    expect(await repo.findById(hours.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });

  describe('listForCenter', () => {
    it('returns live rows ordered by weekday, tombstones excluded', async () => {
      await repo.save(makeHours({ dayOfWeek: 3 as WeekdayIndex }));
      await repo.save(makeHours({ dayOfWeek: 1 as WeekdayIndex }));
      const deleted = makeHours({ dayOfWeek: 5 as WeekdayIndex });
      await repo.save(deleted);
      await repo.softDelete(deleted.id, AT);

      const rows = await repo.listForCenter(CENTER);
      expect(rows.map((r) => r.dayOfWeek)).toEqual([1, 3]);
    });
  });

  describe('findByDay', () => {
    it('finds the live row for a weekday and null for an unsaved one', async () => {
      await repo.save(makeHours({ dayOfWeek: 2 as WeekdayIndex }));
      expect((await repo.findByDay(CENTER, 2 as WeekdayIndex))?.dayOfWeek).toBe(2);
      expect(await repo.findByDay(CENTER, 4 as WeekdayIndex)).toBeNull();
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the chr_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeHours({ id: 'bad_00000000000000000000000001' as CenterHoursId })),
      ).rejects.toThrow();
    });

    it('rejects a half-set day — open set, close null (CHECK)', async () => {
      await expect(repo.save(makeHours({ open: '09:00' as TimeOfDay, close: null }))).rejects.toThrow();
    });

    it('rejects an out-of-range weekday (CHECK)', async () => {
      await expect(repo.save(makeHours({ dayOfWeek: 9 as WeekdayIndex }))).rejects.toThrow();
    });

    it('rejects a second live row for the same (center, weekday) (unique partial index)', async () => {
      await repo.save(makeHours({ dayOfWeek: 1 as WeekdayIndex }));
      await expect(repo.save(makeHours({ dayOfWeek: 1 as WeekdayIndex }))).rejects.toThrow();
    });

    it('allows re-creating a weekday after its previous row was soft-deleted', async () => {
      const first = makeHours({ dayOfWeek: 6 as WeekdayIndex });
      await repo.save(first);
      await repo.softDelete(first.id, AT);
      await expect(repo.save(makeHours({ dayOfWeek: 6 as WeekdayIndex }))).resolves.toBeUndefined();
    });
  });
});
