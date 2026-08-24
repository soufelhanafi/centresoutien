import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  CenterSetupUnit,
  CenterCode,
  CenterHours,
  CenterHoursId,
  CenterId,
  DeviceId,
  Niveau,
  NiveauId,
  UserId,
  WeekdayIndex,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteCenterSetupUnitOfWork } from '../../src/data/sqlite/repositories/center-setup-unit-of-work';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-07-29T10:00:00.000Z');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-center-setup-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function setupUnit(): CenterSetupUnit {
  const defaultHours: CenterHours[] = Array.from({ length: 7 }, (_, day) => ({
    id: `chr_${String(day + 1).padStart(26, '0')}` as CenterHoursId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    dayOfWeek: day as WeekdayIndex,
    windows: [{ open: '09:00', close: '18:00' }],
  }));

  const defaultNiveaux: Niveau[] = [
    {
      id: 'niv_00000000000000000000000001' as NiveauId,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      createdAt: AT,
      updatedAt: AT,
      updatedBy: USER,
      deletedAt: null,
      version: 0,
      name: { fr: '1ère Année Primaire', ar: 'السنة الأولى ابتدائي' },
      code: '1AP',
      category: 'primaire',
      active: true,
    },
  ];

  return {
    center: {
      id: 'ctr_00000000000000000000000001' as CenterId,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      createdAt: AT,
      updatedAt: AT,
      updatedBy: USER,
      deletedAt: null,
      version: 0,
      name: 'Centre Al Ilm',
      address: '',
      phone: '',
      email: '',
      logoPath: null,
      plan: 'essentiel',
    },
    defaultHours,
    defaultNiveaux,
    trial: { startedAt: AT, lastSeenAt: AT },
    organization: null,
    membership: null,
  };
}

describe('SqliteCenterSetupUnitOfWork', () => {
  it('rolls back a failed setup after center creation, then persists one complete retry', async () => {
    let fail = true;
    const setup = new SqliteCenterSetupUnitOfWork(db, {
      afterCenterInsert: () => {
        if (fail) throw new Error('injected setup failure');
      },
    });
    const unit = setupUnit();

    await expect(setup.commit(unit)).rejects.toThrow('injected setup failure');
    expect(db.prepare('SELECT COUNT(*) AS count FROM center').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM center_hours').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM niveaux').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM center_trial').get()).toEqual({ count: 0 });

    fail = false;
    await setup.commit(unit);

    expect(db.prepare('SELECT COUNT(*) AS count FROM center').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM center_hours').get()).toEqual({ count: 7 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM niveaux').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT code FROM niveaux').get()).toEqual({ code: '1AP' });
    expect(db.prepare('SELECT COUNT(*) AS count FROM center_trial').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT started_at FROM center_trial').get()).toEqual({ started_at: AT.toISOString() });
  });
});
