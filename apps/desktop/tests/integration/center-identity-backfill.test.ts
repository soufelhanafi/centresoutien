import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Clock, DeviceId } from '@centresoutien/domain';
import { openDatabaseAt } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { backfillCenterIdentityChangeLog } from '../../src/data/sqlite/center-identity-backfill';

const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const KEY = 'backfill-key-under-test';
const AT = new Date('2026-08-25T10:00:00Z');
const ISO = AT.toISOString();
const clock: Clock = { now: () => AT };

const CENTER = 'CS-CASA-001';
const THIS_DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const OTHER_DEVICE = 'dev_00000000000000000000000002' as DeviceId;
const DIRECTOR = 'usr_00000000000000000000000009';

let dir: string;
let db: DB;

/** Seed a center + owning org + director membership exactly as a PRE-SOU-318
 *  build would have: rows present, but NO change_log entries for them. */
function seedLegacyIdentity(device: DeviceId): void {
  db.prepare(
    `INSERT INTO center (id, center_code, device_origin, created_at, updated_at, updated_by,
                         deleted_at, version, name, address, phone, email, logo_path, plan, singleton)
     VALUES (@id, @cc, @dev, @at, @at, @by, NULL, 1, 'Centre Al Ilm', '', '', '', NULL, 'pro', 1)`,
  ).run({ id: 'ctr_00000000000000000000000001', cc: CENTER, dev: device, at: ISO, by: DIRECTOR });
  db.prepare(
    `INSERT INTO organization (id, center_code, device_origin, created_at, updated_at, updated_by,
                               deleted_at, version, name, billing_contact)
     VALUES (@id, @cc, @dev, @at, @at, @by, NULL, 1, 'Al Ilm', 'contact@alilm.ma')`,
  ).run({ id: 'org_00000000000000000000000001', cc: CENTER, dev: device, at: ISO, by: DIRECTOR });
  db.prepare(
    `INSERT INTO membership (id, center_code, device_origin, created_at, updated_at, updated_by,
                             deleted_at, version, user_id, centre_id, role)
     VALUES (@id, @cc, @dev, @at, @at, @by, NULL, 1, @user, @cc, 'owner')`,
  ).run({ id: 'mbr_00000000000000000000000001', cc: CENTER, dev: device, at: ISO, by: DIRECTOR, user: DIRECTOR });
}

function changeLogEntries(entityType: string): { entity_id: string; op: string }[] {
  return db
    .prepare('SELECT entity_id, op FROM change_log WHERE entity_type = ? ORDER BY revision')
    .all(entityType) as { entity_id: string; op: string }[];
}

function runBackfill(device: DeviceId): void {
  backfillCenterIdentityChangeLog(db, new SqliteChangeLogWriter(db, clock, device), device);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-backfill-'));
  db = openDatabaseAt(join(dir, 'centre.db'), KEY);
  runMigrations(db, REAL_MIGRATIONS);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('backfillCenterIdentityChangeLog (SOU-318)', () => {
  it('logs a pre-SOU-318 center + org + membership this device authored so they enter the feed', () => {
    seedLegacyIdentity(THIS_DEVICE);
    expect(changeLogEntries('center')).toHaveLength(0);

    runBackfill(THIS_DEVICE);

    expect(changeLogEntries('center')).toEqual([{ entity_id: 'ctr_00000000000000000000000001', op: 'create' }]);
    expect(changeLogEntries('organization')).toEqual([
      { entity_id: 'org_00000000000000000000000001', op: 'create' },
    ]);
    expect(changeLogEntries('membership')).toEqual([
      { entity_id: 'mbr_00000000000000000000000001', op: 'create' },
    ]);
  });

  it('serializes the center payload as the domain shape, so sync-apply can reconstruct it', () => {
    seedLegacyIdentity(THIS_DEVICE);
    runBackfill(THIS_DEVICE);

    const { payload } = db
      .prepare("SELECT payload FROM change_log WHERE entity_type = 'center'")
      .get() as { payload: string };
    const entity = (JSON.parse(payload) as { entity: Record<string, unknown> }).entity;
    expect(entity['centerCode']).toBe(CENTER);
    expect(entity['name']).toBe('Centre Al Ilm');
    expect(entity['plan']).toBe('pro');
  });

  it('does NOT log identity a DIFFERENT device authored — a joined replica must not echo-push it back', () => {
    // A joined replica's identity rows arrive via sync-apply (real tables, no
    // change_log). Their device_origin is the HOST, not this device.
    seedLegacyIdentity(OTHER_DEVICE);

    runBackfill(THIS_DEVICE);

    expect(changeLogEntries('center')).toHaveLength(0);
    expect(changeLogEntries('organization')).toHaveLength(0);
    expect(changeLogEntries('membership')).toHaveLength(0);
  });

  it('is idempotent — a second run adds nothing (safe to run on every center open)', () => {
    seedLegacyIdentity(THIS_DEVICE);

    runBackfill(THIS_DEVICE);
    runBackfill(THIS_DEVICE);

    expect(changeLogEntries('center')).toHaveLength(1);
    expect(changeLogEntries('organization')).toHaveLength(1);
    expect(changeLogEntries('membership')).toHaveLength(1);
  });

  it('no-ops on an empty DB (a first run before any center exists)', () => {
    expect(() => runBackfill(THIS_DEVICE)).not.toThrow();
    expect(changeLogEntries('center')).toHaveLength(0);
  });
});
