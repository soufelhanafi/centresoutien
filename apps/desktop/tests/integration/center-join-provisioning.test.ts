import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  CenterJoinError,
  PLANS,
  PlanPolicy,
  type CenterCode,
  type Clock,
  type DeviceId,
  type EntityId,
  type IdGenerator,
  type UserId,
} from '@centresoutien/domain';
import { openDatabase, openDatabaseAt } from '../../src/data/sqlite/db';
import { loadMigrations, runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteHubStore } from '../../src/data/sqlite/hub/hub-store';
import { HubServer } from '../../src/main/hub-server/hub-server';
import { HttpSyncHubClient } from '../../src/data/sync/http-sync-hub-client';
import { SqliteCenterJoinProvisioning } from '../../src/data/sqlite/center-join-provisioning';
import { CENTER, HubDevice } from './helpers/hub-device';

const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const HUB_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/hub/migrations');
const KEY = 'joiner-key-under-test';
const HUB_KEY = 'hub-key-under-test';
const TOKEN = 'PAIR-CODE-1234';
const AT = new Date('2026-08-24T10:00:00Z');
const HOST_DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const DIRECTOR = 'usr_00000000000000000000000009' as UserId;
const SYSTEM = 'usr_local-device' as UserId;

const clock: Clock = { now: () => AT };
function counterIds(seed = 1): IdGenerator {
  let n = seed;
  return { next: <T extends string = string>(prefix: string) => `${prefix}_${String(n++).padStart(26, '0')}` as T };
}

const ISO = AT.toISOString();

/** A host-authored center entity, domain shape — exactly what a real device would
 *  have pushed after first-run setup. */
const CENTER_ENTITY: Record<string, unknown> = {
  id: 'ctr_00000000000000000000000001',
  centerCode: CENTER,
  deviceOrigin: HOST_DEVICE,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: DIRECTOR,
  deletedAt: null,
  version: 1,
  name: 'Centre Al Ilm',
  address: '12 Rue Mohammed V',
  phone: '0522-000000',
  email: 'contact@alilm.ma',
  logoPath: null,
  plan: 'pro',
};

const OWNER_ENTITY: Record<string, unknown> = {
  id: DIRECTOR,
  centerCode: CENTER,
  deviceOrigin: HOST_DEVICE,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: DIRECTOR,
  deletedAt: null,
  version: 1,
  role: 'owner',
  username: 'directrice',
  passwordHash: '$argon2id$v=19$m=1,t=1,p=1$abc$def',
  setupCodeHash: null,
  setupCodeExpiresAt: null,
  setupCodeRedeemedAt: null,
  email: null,
};

const SUBJECT_ENTITY: Record<string, unknown> = {
  id: 'sub_00000000000000000000000001',
  centerCode: CENTER,
  deviceOrigin: HOST_DEVICE,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: DIRECTOR,
  deletedAt: null,
  version: 1,
  name: { fr: 'Mathématiques', ar: 'الرياضيات' },
  code: 'MATH',
  active: true,
};

let hubDir: string;
let joinDir: string;
let hubDb: DB;
let store: SqliteHubStore;
let server: HubServer;
let baseUrl: string;
let written: { centreId: string; config: { baseUrl: string; token: string } }[];

beforeEach(async () => {
  hubDir = mkdtempSync(join(tmpdir(), 'cs-join-hub-'));
  joinDir = mkdtempSync(join(tmpdir(), 'cs-join-dev-'));
  written = [];

  hubDb = openDatabaseAt(join(hubDir, 'hub.db'), HUB_KEY);
  runMigrations(hubDb, HUB_MIGRATIONS);
  store = new SqliteHubStore(hubDb, clock);
  store.registerCenter(CENTER, TOKEN, AT);
  server = new HubServer(store, 0, '127.0.0.1');
  const port = await server.start();
  baseUrl = `http://127.0.0.1:${port}`;

  // Populate the hub exactly as a real host would: push the center identity, the
  // owner account, and a subject through the real HTTP hub.
  const host = new HubDevice({
    hub: new HttpSyncHubClient({ baseUrl, token: TOKEN }),
    clock,
    deviceId: HOST_DEVICE,
    updatedBy: DIRECTOR,
  });
  host.write('center', CENTER_ENTITY['id'] as EntityId, CENTER_ENTITY, ['name'], DIRECTOR);
  host.write('users', OWNER_ENTITY['id'] as EntityId, OWNER_ENTITY, ['username'], DIRECTOR);
  host.write('subjects', SUBJECT_ENTITY['id'] as EntityId, SUBJECT_ENTITY, ['name'], DIRECTOR);
  await host.sync();
});

afterEach(async () => {
  await server.stop();
  hubDb.close();
  rmSync(hubDir, { recursive: true, force: true });
  rmSync(joinDir, { recursive: true, force: true });
});

function makeJoiner() {
  return new SqliteCenterJoinProvisioning({
    dir: joinDir,
    keyFor: () => KEY,
    migrations: loadMigrations(REAL_MIGRATIONS),
    clock,
    ids: counterIds(),
    plan: new PlanPolicy(PLANS.pro),
    clientConfig: {
      write: (centreId, config) => written.push({ centreId, config }),
      clear: () => {},
    },
    systemUserId: SYSTEM,
  });
}

describe('SqliteCenterJoinProvisioning cold-bootstrap (SOU-318)', () => {
  it('rebuilds the center, owner, and data into a fresh local DB from the hub feed', async () => {
    const result = await makeJoiner().provisionFromHub({ baseUrl, token: TOKEN, centerCode: CENTER });

    expect(result.centerCode).toBe(CENTER);
    // The hub-client config was persisted so the joined center keeps syncing.
    expect(written).toEqual([{ centreId: result.centreId, config: { baseUrl, token: TOKEN } }]);

    const db = openDatabase({ centreId: result.centreId, key: KEY, dir: joinDir });
    try {
      const center = db.prepare('SELECT name, center_code, plan FROM center').get() as {
        name: string;
        center_code: string;
        plan: string;
      };
      expect(center).toEqual({ name: 'Centre Al Ilm', center_code: CENTER, plan: 'pro' });

      const owner = db.prepare("SELECT username, role FROM users WHERE role = 'owner'").get() as {
        username: string;
        role: string;
      };
      expect(owner).toEqual({ username: 'directrice', role: 'owner' });

      const subject = db.prepare('SELECT name_fr, code FROM subjects').get() as {
        name_fr: string;
        code: string;
      };
      expect(subject).toEqual({ name_fr: 'Mathématiques', code: 'MATH' });
    } finally {
      db.close();
    }
  });

  it('rejects a wrong pairing token and leaves no center behind', async () => {
    await expect(
      makeJoiner().provisionFromHub({ baseUrl, token: 'WRONG-TOKEN', centerCode: CENTER }),
    ).rejects.toBeInstanceOf(CenterJoinError);

    expect(readdirSync(joinDir).filter((f) => f.startsWith('centre-'))).toEqual([]);
    expect(written).toEqual([]);
  });

  it('fails when the hub serves no matching center (empty feed)', async () => {
    await expect(
      makeJoiner().provisionFromHub({ baseUrl, token: TOKEN, centerCode: 'CS-OTHER-999' as CenterCode }),
    ).rejects.toBeInstanceOf(CenterJoinError);

    expect(readdirSync(joinDir).filter((f) => f.startsWith('centre-'))).toEqual([]);
  });
});
