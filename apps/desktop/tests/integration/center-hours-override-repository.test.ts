import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  CenterCode,
  DeviceId,
  UserId,
  TimeOfDay,
  WeeklyTimeWindows,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteCenterHoursOverrideRepository } from '../../src/data/sqlite/repositories/center-hours-override-repository';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const AT = new Date('2026-01-15T10:00:00Z');
const USER = 'usr_00000000000000000000000001' as UserId;

const win = (open: string, close: string) => ({ open: open as TimeOfDay, close: close as TimeOfDay });
const uniform = (windows: ReturnType<typeof win>[]): WeeklyTimeWindows => ({
  0: windows, 1: windows, 2: windows, 3: windows, 4: windows, 5: windows, 6: windows,
});

let dir: string;
let db: DB;
let repo: SqliteCenterHoursOverrideRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-hours-override-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteCenterHoursOverrideRepository(db, changeLogWriterForTest(db));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

let seq = 1;
function makeOverride(over: Partial<CenterHoursOverride> = {}): CenterHoursOverride {
  return {
    id: `cho_${String(seq++).padStart(26, '0')}` as CenterHoursOverrideId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    dateRange: { start: '2026-02-18', end: '2026-03-19' },
    hoursByWeekday: uniform([win('09:00', '15:00'), win('21:00', '23:00')]),
    ...over,
  };
}

describe('SqliteCenterHoursOverrideRepository', () => {
  it('round-trips an override (multi-window days) through save + findById', async () => {
    const override = makeOverride();
    await repo.save(override);
    expect(await repo.findById(override.id)).toEqual(override);
  });

  it('round-trips a closed weekday (empty window list)', async () => {
    const override = makeOverride({
      hoursByWeekday: { ...uniform([win('09:00', '15:00')]), 5: [] },
    });
    await repo.save(override);
    expect((await repo.findById(override.id))?.hoursByWeekday[5]).toEqual([]);
  });

  it('upsert updates the range and hours on a second save of the same id', async () => {
    const override = makeOverride();
    await repo.save(override);
    await repo.save({ ...override, dateRange: { start: '2026-02-18', end: '2026-03-20' }, version: 2 });
    const found = await repo.findById(override.id);
    expect(found?.dateRange.end).toBe('2026-03-20');
    expect(found?.version).toBe(2);
  });

  it('softDelete hides the row but keeps it in the sync feed', async () => {
    const override = makeOverride();
    await repo.save(override);
    await repo.softDelete(override.id, new Date('2026-04-01T00:00:00Z'), USER);

    expect(await repo.findById(override.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-04-01T00:00:00Z'));
  });

  describe('listForCenter', () => {
    it('returns live rows ordered by range start then id, tombstones excluded', async () => {
      await repo.save(makeOverride({ dateRange: { start: '2026-06-01', end: '2026-06-30' } }));
      await repo.save(makeOverride({ dateRange: { start: '2026-02-18', end: '2026-03-19' } }));
      const deleted = makeOverride({ dateRange: { start: '2026-05-01', end: '2026-05-10' } });
      await repo.save(deleted);
      await repo.softDelete(deleted.id, AT, USER);

      const rows = await repo.listForCenter(CENTER);
      expect(rows.map((r) => r.dateRange.start)).toEqual(['2026-02-18', '2026-06-01']);
    });
  });

  describe('listOverlapping', () => {
    it('returns only overrides whose range intersects the query window', async () => {
      await repo.save(makeOverride({ dateRange: { start: '2026-02-18', end: '2026-03-19' } }));
      await repo.save(makeOverride({ dateRange: { start: '2026-06-01', end: '2026-06-30' } }));

      const rows = await repo.listOverlapping(CENTER, '2026-03-01', '2026-03-31');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.dateRange.start).toBe('2026-02-18');
    });

    it('matches a single-day query touching a boundary (inclusive)', async () => {
      await repo.save(makeOverride({ dateRange: { start: '2026-02-18', end: '2026-03-19' } }));
      expect(await repo.listOverlapping(CENTER, '2026-03-19', '2026-03-19')).toHaveLength(1);
      expect(await repo.listOverlapping(CENTER, '2026-03-20', '2026-03-20')).toHaveLength(0);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the cho_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeOverride({ id: 'bad_00000000000000000000000001' as CenterHoursOverrideId })),
      ).rejects.toThrow();
    });

    it('rejects an inverted date range (CHECK end_date >= start_date)', async () => {
      await expect(
        repo.save(makeOverride({ dateRange: { start: '2026-03-19', end: '2026-02-18' } })),
      ).rejects.toThrow();
    });
  });
});

type ChangeLogRow = {
  entity_type: string;
  entity_id: string;
  revision: number;
  op: string;
  payload: string;
};

function overrideLogRows(): ChangeLogRow[] {
  return db
    .prepare(
      "SELECT entity_type, entity_id, revision, op, payload FROM change_log WHERE entity_type = 'center_hours_overrides' ORDER BY rowid",
    )
    .all() as ChangeLogRow[];
}

describe('SqliteCenterHoursOverrideRepository — change_log append (SOU-199)', () => {
  it('appends one center_hours_overrides row per write with monotonic revision and derived op', async () => {
    const override = makeOverride();
    await repo.save(override);
    await repo.save({ ...override, dateRange: { start: '2026-02-18', end: '2026-03-20' }, version: 1 });
    await repo.softDelete(override.id, new Date('2026-04-01T00:00:00Z'), USER);

    const rows = overrideLogRows();
    expect(rows.map((r) => [r.revision, r.op])).toEqual([
      [1, 'create'],
      [2, 'update'],
      [3, 'delete'],
    ]);
    expect(rows.every((r) => r.entity_id === override.id)).toBe(true);
  });

  it('stores the versioned DOMAIN entity (nested dateRange + hoursByWeekday), never the flat row', async () => {
    const override = makeOverride();
    await repo.save(override);

    const [row] = overrideLogRows();
    const payload = JSON.parse(row!.payload) as {
      version: number;
      entity: {
        dateRange: { start: string; end: string };
        hoursByWeekday: Record<string, unknown>;
        deviceOrigin: string;
      };
    };
    expect(payload.version).toBe(1);
    expect(payload.entity.dateRange).toEqual({ start: '2026-02-18', end: '2026-03-19' });
    expect(payload.entity.deviceOrigin).toBe(override.deviceOrigin);
    expect(payload.entity.hoursByWeekday['0']).toEqual([
      { open: '09:00', close: '15:00' },
      { open: '21:00', close: '23:00' },
    ]);
    // The physical snake_case shape must NOT leak into the portable payload.
    expect(row!.payload).not.toContain('start_date');
    expect(row!.payload).not.toContain('hours_by_weekday');
  });

  it('logs the tombstoned domain entity on softDelete (deletedAt set)', async () => {
    const override = makeOverride();
    await repo.save(override);
    await repo.softDelete(override.id, new Date('2026-04-01T00:00:00Z'), USER);

    const rows = overrideLogRows();
    const payload = JSON.parse(rows[rows.length - 1]!.payload) as {
      entity: { deletedAt: string | null };
    };
    expect(payload.entity.deletedAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('rolls the log append back with the entity write on a failed save (single transaction)', async () => {
    await expect(
      repo.save(makeOverride({ dateRange: { start: '2026-03-19', end: '2026-02-18' } })),
    ).rejects.toThrow();
    expect(overrideLogRows()).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM center_hours_overrides').get()).toEqual({ n: 0 });
  });
});
