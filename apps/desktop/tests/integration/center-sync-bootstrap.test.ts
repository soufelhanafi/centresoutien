import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Center,
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
import { SqliteCenterSetupUnitOfWork } from '../../src/data/sqlite/repositories/center-setup-unit-of-work';
import { SqliteCenterRepository } from '../../src/data/sqlite/repositories/center-repository';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { replayChangeLog } from '../../src/data/sqlite/change-log/replay-change-log';

/**
 * SOU-318 cold-bootstrap proof. Making `center`, `organization`, and `membership`
 * synced entity types is what lets a SECOND device rebuild a center's identity —
 * profile, owning org, director membership — purely from the hub feed, not just
 * its data. This test seeds those rows on a "host" through the same write paths
 * production uses (setup unit-of-work + profile edit), carries only the resulting
 * `change_log` rows to a fresh, empty device DB, and replays them there — the same
 * domain→row mapper path sync-apply uses. The empty device must end up with the
 * host's exact center/organization/membership state.
 */

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-07-29T10:00:00.000Z');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const CLOCK: Clock = { now: () => AT };

type ChangeLogRow = {
  entity_type: string;
  entity_id: string;
  revision: number;
  op: string;
  payload: string;
  device_id: string;
  created_at: string;
  center_code: string;
};

let dir: string;
let host: DB;
let device: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-bootstrap-'));
  host = openDatabase({ centreId: 'HOST', key: KEY, dir });
  device = openDatabase({ centreId: 'DEVICE', key: KEY, dir });
  runMigrations(host, REAL_MIGRATIONS);
  runMigrations(device, REAL_MIGRATIONS);
});

afterEach(() => {
  host.close();
  device.close();
  rmSync(dir, { recursive: true, force: true });
});

function center(over: Partial<Center> = {}): Center {
  return {
    id: 'ctr_00000000000000000000000001' as CenterId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: 'Centre Al Ilm',
    address: '12 Rue Mohammed V',
    phone: '0522-000000',
    email: 'contact@alilm.ma',
    logoPath: null,
    plan: 'premium',
    ...over,
  };
}

function ownership(): { organization: Organization; membership: Membership } {
  return {
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
    },
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
    },
  };
}

function defaultHours(): CenterHours[] {
  return Array.from({ length: 7 }, (_, day) => ({
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
}

const NIVEAU: Niveau = {
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
};

/** Copies every change_log row from the host into the device — the transport a
 *  real pull performs, minus the network. */
function carryFeedToDevice(): void {
  const rows = host
    .prepare(
      'SELECT entity_type, entity_id, revision, op, payload, device_id, created_at, center_code FROM change_log ORDER BY rowid',
    )
    .all() as ChangeLogRow[];
  const insert = device.prepare(
    `INSERT INTO change_log
       (entity_type, entity_id, revision, op, payload, device_id, created_at, center_code)
     VALUES
       (@entity_type, @entity_id, @revision, @op, @payload, @device_id, @created_at, @center_code)`,
  );
  const insertAll = device.transaction((all: ChangeLogRow[]) => {
    for (const row of all) insert.run(row);
  });
  insertAll(rows);
}

describe('SOU-318 center/organization/membership cold-bootstrap', () => {
  it('rebuilds a center identity on an empty device from the change-log feed alone', async () => {
    const changeLog = new SqliteChangeLogWriter(host, CLOCK, DEVICE);
    const { organization, membership } = ownership();
    await new SqliteCenterSetupUnitOfWork(host, changeLog).commit({
      center: center(),
      defaultHours: defaultHours(),
      defaultNiveaux: [NIVEAU],
      trial: null,
      organization,
      membership,
    });

    carryFeedToDevice();
    replayChangeLog(device);

    const deviceCenter = await new SqliteCenterRepository(device, changeLog).get();
    expect(deviceCenter).toEqual(center());

    expect(device.prepare('SELECT id, name, billing_contact FROM organization').get()).toEqual({
      id: organization.id,
      name: 'Centre Al Ilm',
      billing_contact: 'contact@alilm.ma',
    });
    expect(device.prepare('SELECT id, user_id, centre_id, role FROM membership').get()).toEqual({
      id: membership.id,
      user_id: USER,
      centre_id: CENTER,
      role: 'owner',
    });
  });

  it('carries a later profile edit through to the device (latest revision wins)', async () => {
    const changeLog = new SqliteChangeLogWriter(host, CLOCK, DEVICE);
    const { organization, membership } = ownership();
    await new SqliteCenterSetupUnitOfWork(host, changeLog).commit({
      center: center(),
      defaultHours: defaultHours(),
      defaultNiveaux: [NIVEAU],
      trial: null,
      organization,
      membership,
    });
    // A profile rename after setup — the edit path that goes through the repo.
    await new SqliteCenterRepository(host, changeLog).save(
      center({ name: 'Centre Renommé', version: 1 }),
    );

    carryFeedToDevice();
    replayChangeLog(device);

    const deviceCenter = await new SqliteCenterRepository(device, changeLog).get();
    expect(deviceCenter?.name).toBe('Centre Renommé');
    expect(deviceCenter?.version).toBe(1);
    // Still one singleton row — the edit upserted by id, never duplicated it.
    expect(device.prepare('SELECT COUNT(*) AS count FROM center').get()).toEqual({ count: 1 });
  });
});
