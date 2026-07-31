import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Holiday, HolidayId, CenterCode, DeviceId, UserId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteHolidayRepository } from '../../src/data/sqlite/repositories/holiday-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;

let dir: string;
let db: DB;
let repo: SqliteHolidayRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-hol-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteHolidayRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeHoliday(over: Partial<Holiday> = {}): Holiday {
  seq += 1;
  return {
    id: `hol_${String(seq).padStart(26, '0')}` as HolidayId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: { fr: 'Fête du Trône', ar: 'عيد العرش' },
    kind: 'fixed',
    startDate: '2026-07-30',
    endDate: '2026-07-30',
    affectsInvoicing: false,
    ...over,
  };
}

describe('SqliteHolidayRepository', () => {
  it('round-trips a holiday through save + findById with all fields intact', async () => {
    const holiday = makeHoliday({
      kind: 'lunar',
      name: { fr: 'Aïd al-Fitr', ar: 'عيد الفطر' },
      startDate: '2026-05-27',
      endDate: '2026-05-29',
    });
    await repo.save(holiday);
    expect(await repo.findById(holiday.id)).toEqual(holiday);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('hol_00000000000000000000000099' as HolidayId)).toBeNull();
  });

  it('upsert updates mutable fields + version but not identity on a second save', async () => {
    const holiday = makeHoliday();
    await repo.save(holiday);
    await repo.save(
      makeHoliday({
        id: holiday.id,
        name: { fr: 'Renommée', ar: 'ع' },
        kind: 'lunar',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById(holiday.id);
    expect(found?.name.fr).toBe('Renommée');
    expect(found?.kind).toBe('lunar');
    expect(found?.endDate).toBe('2026-08-02');
    expect(found?.version).toBe(3);
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.deviceOrigin).toBe('dev_00000000000000000000000001');
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const holiday = makeHoliday();
    await repo.save(holiday);
    await repo.softDelete(holiday.id, new Date('2026-08-02T00:00:00Z'), USER);

    expect(await repo.findById(holiday.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeHoliday({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      const later = makeHoliday({ updatedAt: new Date('2026-07-20T00:00:00Z') });
      await repo.save(later);

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((h) => h.id)).toEqual([later.id]);
    });
  });

  describe('listActive', () => {
    it('returns only live holidays of the center, ordered by start_date then name, excluding tombstones + other centers', async () => {
      await repo.save(makeHoliday({ name: { fr: 'C', ar: 'ع' }, startDate: '2026-11-06', endDate: '2026-11-06' }));
      await repo.save(makeHoliday({ name: { fr: 'A', ar: 'ع' }, startDate: '2026-01-01', endDate: '2026-01-01' }));
      const gone = makeHoliday({ name: { fr: 'Z', ar: 'ع' }, startDate: '2026-05-01', endDate: '2026-05-01' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeHoliday({ name: { fr: 'Étranger', ar: 'ع' }, centerCode: OTHER_CENTER }));

      const active = await repo.listActive(CENTER);
      expect(active.map((h) => h.name.fr)).toEqual(['A', 'C']);
    });
  });

  describe('listArchived', () => {
    it('returns only tombstoned holidays of the center, ordered by start_date', async () => {
      await repo.save(makeHoliday({ name: { fr: 'Live', ar: 'ع' } }));
      const g1 = makeHoliday({ name: { fr: 'Y', ar: 'ع' }, startDate: '2026-09-01', endDate: '2026-09-01' });
      const g2 = makeHoliday({ name: { fr: 'X', ar: 'ع' }, startDate: '2026-03-01', endDate: '2026-03-01' });
      await repo.save(g1);
      await repo.save(g2);
      await repo.softDelete(g1.id, AT, USER);
      await repo.softDelete(g2.id, AT, USER);

      const archived = await repo.listArchived(CENTER);
      expect(archived.map((h) => h.name.fr)).toEqual(['X', 'Y']);
    });
  });

  describe('findArchivedById', () => {
    it('returns a tombstoned row and null for a live or unknown id', async () => {
      const live = makeHoliday();
      await repo.save(live);
      expect(await repo.findArchivedById(live.id)).toBeNull();

      const gone = makeHoliday();
      await repo.save(gone);
      await repo.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), USER);
      const found = await repo.findArchivedById(gone.id);
      expect(found?.id).toBe(gone.id);
      expect(found?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));

      expect(await repo.findArchivedById('hol_00000000000000000000000099' as HolidayId)).toBeNull();
    });

    it('round-trips a restore: clear deleted_at via save, then the row is live again', async () => {
      const holiday = makeHoliday();
      await repo.save(holiday);
      await repo.softDelete(holiday.id, new Date('2026-08-02T00:00:00Z'), USER);

      const archived = await repo.findArchivedById(holiday.id);
      expect(archived).not.toBeNull();
      await repo.save({ ...(archived as Holiday), deletedAt: null, updatedAt: new Date('2026-08-03T00:00:00Z') });

      expect(await repo.findById(holiday.id)).not.toBeNull();
      expect(await repo.findArchivedById(holiday.id)).toBeNull();
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the hol_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeHoliday({ id: 'bad_00000000000000000000000001' as HolidayId })),
      ).rejects.toThrow();
    });

    it('rejects an unknown kind (CHECK)', async () => {
      // @ts-expect-error — exercising the DB CHECK with an invalid kind
      await expect(repo.save(makeHoliday({ kind: 'weekly' }))).rejects.toThrow();
    });

    it('rejects end_date before start_date (CHECK)', async () => {
      await expect(
        repo.save(makeHoliday({ startDate: '2026-07-30', endDate: '2026-07-29' })),
      ).rejects.toThrow();
    });
  });
});
