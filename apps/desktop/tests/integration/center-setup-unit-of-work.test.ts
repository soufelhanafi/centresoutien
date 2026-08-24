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
  Clock,
  DeviceId,
  Membership,
  MembershipId,
  Niveau,
  NiveauId,
  Organization,
  OrganizationId,
  UserId,
  WeekdayIndex,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteCenterSetupUnitOfWork, type SqliteCenterSetupUnitOfWorkOptions } from '../../src/data/sqlite/repositories/center-setup-unit-of-work';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-07-29T10:00:00.000Z');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const CLOCK: Clock = { now: () => AT };

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-center-setup-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
});

function makeSetup(options: SqliteCenterSetupUnitOfWorkOptions = {}): SqliteCenterSetupUnitOfWork {
  return new SqliteCenterSetupUnitOfWork(db, new SqliteChangeLogWriter(db, CLOCK, DEVICE), options);
}

function loggedEntityTypes(): string[] {
  return (
    db.prepare('SELECT entity_type FROM change_log ORDER BY rowid').all() as { entity_type: string }[]
  ).map((row) => row.entity_type);
}

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
    const setup = makeSetup({
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
    // The change-log append shares the setup transaction, so a rolled-back setup
    // leaves no orphaned 'center' log row behind (SOU-318).
    expect(loggedEntityTypes()).toEqual([]);

    fail = false;
    await setup.commit(unit);

    expect(db.prepare('SELECT COUNT(*) AS count FROM center').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM center_hours').get()).toEqual({ count: 7 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM niveaux').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT code FROM niveaux').get()).toEqual({ code: '1AP' });
    expect(db.prepare('SELECT COUNT(*) AS count FROM center_trial').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT started_at FROM center_trial').get()).toEqual({ started_at: AT.toISOString() });
    // A first-run seed (no owner yet) logs only the center row for sync.
    expect(loggedEntityTypes()).toEqual(['center']);
  });

  it('logs center + organization + membership when ownership is seeded (SOU-318 add-a-center)', async () => {
    const unit: CenterSetupUnit = {
      ...setupUnit(),
      organization: {
        id: 'org_00000000000000000000000001' as OrganizationId,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        createdAt: AT,
        updatedAt: AT,
        updatedBy: USER,
        deletedAt: null,
        version: 0,
        name: 'Centre Al Ilm',
        billingContact: 'contact@alilm.ma',
      } satisfies Organization,
      membership: {
        id: 'mbr_00000000000000000000000001' as MembershipId,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        createdAt: AT,
        updatedAt: AT,
        updatedBy: USER,
        deletedAt: null,
        version: 0,
        userId: USER,
        centreId: CENTER,
        role: 'owner',
      } satisfies Membership,
    };

    await makeSetup().commit(unit);

    expect(db.prepare('SELECT COUNT(*) AS count FROM organization').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM membership').get()).toEqual({ count: 1 });
    // All three identity/ownership rows reach the change log so a second device
    // can cold-bootstrap the center from the hub feed.
    expect(loggedEntityTypes()).toEqual(['center', 'organization', 'membership']);
  });
});
