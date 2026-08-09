import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  SCHEMA_VERSION,
  SchemaTooOldError,
  type CenterCode,
  type Clock,
  type DeviceId,
  type EntityId,
  type LocalChange,
  type UserId,
} from '@centresoutien/domain';
import { openDatabaseAt } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { hubDbFileName, SqliteHubStore } from '../../src/data/sqlite/hub/hub-store';
import { HubServer } from '../../src/main/hub-server/hub-server';
import { HttpSyncHubClient } from '../../src/data/sync/http-sync-hub-client';
import { HubTransportError } from '../../src/data/sync/hub-transport-error';
import { CENTER, HubDevice } from './helpers/hub-device';

/**
 * SOU-90 "done when": the embedded hub runs over localhost HTTP with two
 * simulated devices and converges fully, and the hub host's own edits flow
 * through the SAME `SyncHubPort` client as every other device's — the hub
 * laptop is never special-cased. Devices here use the real domain `SyncEngine`
 * over the real HTTP client, hub server, and SQLite canonical store.
 */
const KEY = 'hub-key-under-test';
const HUB_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/hub/migrations');
const TOKEN = 'test-pairing-token';
const AT = new Date('2026-08-01T10:00:00Z');
const DEV_A = 'dev_0000000000000000000000000A' as DeviceId;
const DEV_B = 'dev_0000000000000000000000000B' as DeviceId;
const DEV_H = 'dev_0000000000000000000000000H' as DeviceId;
const USER_A = 'usr_0000000000000000000000000A' as UserId;
const USER_B = 'usr_0000000000000000000000000B' as UserId;
const USER_H = 'usr_0000000000000000000000000H' as UserId;

const S1 = 'stu_00000000000000000000000001' as EntityId;
const S2 = 'stu_00000000000000000000000002' as EntityId;
const S3 = 'stu_00000000000000000000000003' as EntityId;

let dir: string;
let db: DB;
let store: SqliteHubStore;
let server: HubServer;
let clock: Clock;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cs-hub-'));
  db = openDatabaseAt(join(dir, hubDbFileName('local')), KEY);
  runMigrations(db, HUB_MIGRATIONS);
  clock = { now: () => AT };
  store = new SqliteHubStore(db, clock);
  store.registerCenter(CENTER, TOKEN, AT);
  server = new HubServer(store, 0, '127.0.0.1');
  await server.start();
});

afterEach(async () => {
  await server.stop();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function clientFor(token: string = TOKEN): HttpSyncHubClient {
  return new HttpSyncHubClient({ baseUrl: `http://127.0.0.1:${server.port()}`, token });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listen(serverToStart: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    serverToStart.once('error', reject);
    serverToStart.listen(port, '127.0.0.1', () => {
      serverToStart.off('error', reject);
      const address = serverToStart.address();
      resolve(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });
}

function close(serverToStop: Server): Promise<void> {
  return new Promise((resolve) => serverToStop.close(() => resolve()));
}

function delayNextListen(serverToDelay: HubServer, delayMs: number): void {
  const rawServer = (serverToDelay as unknown as { readonly server: Server }).server;
  const originalListen = rawServer.listen.bind(rawServer) as (port: number, host: string) => Server;
  rawServer.listen = ((port: number, host?: string) => {
    setTimeout(() => originalListen(port, host ?? '127.0.0.1'), delayMs);
    return rawServer;
  }) as Server['listen'];
}

function device(deviceId: DeviceId, userId: UserId): HubDevice {
  return new HubDevice({ hub: clientFor(), clock, deviceId, updatedBy: userId });
}

function student(id: EntityId, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    centerCode: CENTER,
    deviceOrigin: 'dev_test',
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    updatedBy: USER_A,
    deletedAt: null,
    version: 0,
    name: { fr: 'Yassine', ar: 'ياسين' },
    level: '2 Bac',
    phone: '0611111111',
    birthDate: '2010-01-15',
    ...overrides,
  };
}

/** A raw protocol push for one entity at `baseVersion` (protocol-level tests). */
function change(entityId: EntityId, baseVersion: number, deviceId: DeviceId = DEV_A): LocalChange {
  return {
    entityType: 'students',
    entityId,
    deviceId,
    baseVersion,
    op: 'create',
    entity: student(entityId),
    changedFields: ['phone'],
    seq: 1,
    at: AT,
    updatedBy: USER_A,
  };
}

/** JSON round-trip normalizes Date vs ISO-string timestamps across devices. */
function stable(device: HubDevice): Record<string, Record<string, unknown>> {
  return JSON.parse(JSON.stringify(device.local.allEntities())) as Record<
    string,
    Record<string, unknown>
  >;
}

describe('embedded hub over localhost (SOU-90)', () => {
  it('retries when the configured port is still releasing during a rapid restart (SOU-191)', async () => {
    const blocker = createServer();
    const port = await listen(blocker, 0);
    const restarting = new HubServer(store, port, '127.0.0.1');

    const started = restarting.start({ retries: 10, retryDelayMs: 10 });
    await delay(20);
    await close(blocker);

    await expect(started).resolves.toBe(port);
    await restarting.stop();
  });

  it('cancels a pending retry when the runtime disposes the container (SOU-191)', async () => {
    const blocker = createServer();
    const port = await listen(blocker, 0);
    const restarting = new HubServer(store, port, '127.0.0.1');

    const started = restarting.start({ retries: 10, retryDelayMs: 10 });
    await delay(20);
    await restarting.stop();
    await close(blocker);

    await expect(started).rejects.toThrow('HubServer stopped before it could start');
    const replacement = createServer();
    await expect(listen(replacement, port)).resolves.toBe(port);
    await close(replacement);
  });

  it('cancels an in-flight bind when the runtime disposes the container (SOU-191)', async () => {
    const starting = new HubServer(store, 0, '127.0.0.1');
    delayNextListen(starting, 20);

    const started = starting.start();
    const stopped = starting.stop();

    await expect(started).rejects.toThrow('HubServer stopped before it could start');
    await stopped;
  });

  it('applies the hub canonical-store migrations on a fresh file', () => {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[]).map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining(['hub_center', 'hub_entity', 'hub_feed', 'hub_cursor', '_schema_migrations']),
    );
  });

  it('two simulated devices + the hub host converge to identical state', async () => {
    const devA = device(DEV_A, USER_A);
    const devB = device(DEV_B, USER_B);
    const devH = device(DEV_H, USER_H);

    devA.write('students', S1, student(S1), ['phone'], USER_A);
    await devA.sync();
    devB.write('students', S2, student(S2, { phone: '0622222222' }), ['phone'], USER_B);
    await devB.sync();
    devH.write('students', S3, student(S3, { phone: '0633333333' }), ['phone'], USER_H);
    await devH.sync();

    await devA.sync();
    await devB.sync();
    await devH.sync();

    expect(stable(devA)).toEqual(stable(devB));
    expect(stable(devB)).toEqual(stable(devH));
    expect(devA.entity('students', S1)?.['phone']).toBe('0611111111');
    expect(devA.entity('students', S2)?.['phone']).toBe('0622222222');
    expect(devA.entity('students', S3)?.['phone']).toBe('0633333333');
    expect(devA.entity('students', S1)?.['version']).toBe(1);
    expect(devA.entity('students', S2)?.['version']).toBe(1);
    expect(devA.entity('students', S3)?.['version']).toBe(1);
  });

  it('edits made on one device flow to the others through the hub', async () => {
    const devA = device(DEV_A, USER_A);
    const devB = device(DEV_B, USER_B);

    devA.write('students', S1, student(S1), ['phone'], USER_A);
    await devA.sync();

    // devB's first sync pulls devA's student before pushing its own.
    devB.write('students', S2, student(S2, { phone: '0622222222' }), ['phone'], USER_B);
    await devB.sync();
    expect(devB.entity('students', S1)?.['phone']).toBe('0611111111');

    devB.write('students', S1, student(S1, { phone: '0699999999' }), ['phone'], USER_B);
    await devB.sync();

    await devA.sync();
    expect(devA.entity('students', S1)?.['phone']).toBe('0699999999');
    expect(devA.entity('students', S1)?.['version']).toBe(2);
    expect(devA.entity('students', S2)?.['phone']).toBe('0622222222');
  });

  it('a stale push is rejected whole, never partially applied', async () => {
    const devA = clientFor();
    const devB = clientFor();

    const first = await devA.pushChanges({
      centreId: CENTER,
      deviceId: DEV_A,
      changes: [change(S1, 0)],
      schemaVersion: SCHEMA_VERSION,
    });
    expect(first.status).toBe('accepted');

    const stale = await devB.pushChanges({
      centreId: CENTER,
      deviceId: DEV_B,
      changes: [change(S1, 0, DEV_B)],
      schemaVersion: SCHEMA_VERSION,
    });
    expect(stale.status).toBe('rejected-stale');

    // The rejected push must not have advanced the feed.
    const batch = await devB.pullChanges(CENTER, null, DEV_B);
    expect(batch.changes).toHaveLength(1);
    expect(batch.changes[0]?.version).toBe(1);

    // Retrying on the fresh base version wins.
    const retry = await devB.pushChanges({
      centreId: CENTER,
      deviceId: DEV_B,
      changes: [change(S1, 1, DEV_B)],
      schemaVersion: SCHEMA_VERSION,
    });
    expect(retry.status).toBe('accepted');
    expect(store.canonicalVersion(CENTER, 'students', S1)).toBe(2);
  });

  it('never advances a device cursor past rows another device pushed in the gap (B1 regression)', async () => {
    const devA = clientFor();
    const devB = clientFor();

    // Both devices pull an empty feed (each cursor at 0), then each pushes a
    // DIFFERENT entity. B's push lands AFTER A's — B never pulled A's row.
    await devA.pullChanges(CENTER, null, DEV_A);
    await devB.pullChanges(CENTER, null, DEV_B);

    await devA.pushChanges({
      centreId: CENTER,
      deviceId: DEV_A,
      changes: [change(S1, 0)],
      schemaVersion: SCHEMA_VERSION,
    });
    const resultB = await devB.pushChanges({
      centreId: CENTER,
      deviceId: DEV_B,
      changes: [change(S2, 0, DEV_B)],
      schemaVersion: SCHEMA_VERSION,
    });
    expect(resultB.status).toBe('accepted');

    // B's cursor must stay at its last consumed position (0) — advancing it to
    // the feed head would skip A's S1 (feed seq 1) forever.
    expect(resultB.cursor).toEqual({ seq: 0 });

    // B's next pull re-delivers A's row alongside its own.
    const batch = await devB.pullChanges(CENTER, resultB.cursor, DEV_B);
    expect(batch.changes.map((c) => c.entityId)).toEqual([S1, S2]);
    expect(batch.changes[0]?.entityId).toBe(S1);
  });

  it('rejects an older device with SchemaTooOldError, never writes it', async () => {
    await expect(
      clientFor().pushChanges({ centreId: CENTER, deviceId: DEV_A, changes: [], schemaVersion: 0 }),
    ).rejects.toBeInstanceOf(SchemaTooOldError);
  });

  it('serializes a simultaneous push race — one accepted, one retried, both converge', async () => {
    const devA = device(DEV_A, USER_A);
    const devB = device(DEV_B, USER_B);

    // Both devices hold the entity at version 1.
    devA.write('students', S1, student(S1), ['phone'], USER_A);
    await devA.sync();
    await devB.sync();
    expect(devB.entity('students', S1)?.['version']).toBe(1);

    // Both edit DIFFERENT fields from the same base, launched concurrently — the
    // hub accepts whichever push lands first; the other gets rejected-stale and
    // the engine's retry loop re-runs pull → resolve → push, auto-merging.
    devA.write('students', S1, student(S1, { phone: '0699999999' }), ['phone'], USER_A);
    devB.write('students', S1, student(S1, { level: '1 Bac' }), ['level'], USER_B);

    const [raceA, raceB] = await Promise.all([devA.sync(), devB.sync()]);
    expect(raceA.pushed).toBe(1);
    expect(raceB.pushed).toBe(1);

    await devA.sync();
    await devB.sync();
    expect(stable(devA)).toEqual(stable(devB));
    expect(devA.entity('students', S1)?.['phone']).toBe('0699999999');
    expect(devA.entity('students', S1)?.['level']).toBe('1 Bac');
    expect(devA.entity('students', S1)?.['version']).toBe(3);
  });

  it('rejects a device with the wrong pairing token', async () => {
    const error = await clientFor('wrong-token')
      .getCursor(DEV_A, CENTER)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HubTransportError);
    expect((error as HubTransportError).code).toBe('unauthorized');
  });

  it('rejects an oversized request body with 413, not a connection reset', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port()}/hub/v1/${CENTER}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-token': TOKEN },
      body: JSON.stringify({
        deviceId: DEV_A,
        schemaVersion: SCHEMA_VERSION,
        changes: [{ oversized: 'x'.repeat(3 * 1024 * 1024) }],
      }),
    });
    expect(response.status).toBe(413);
  });

  it('rejects a malformed push payload with 400, never writing it to the store', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port()}/hub/v1/${CENTER}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-token': TOKEN },
      // `changes` entries must be shaped wire changes — this one is not.
      body: JSON.stringify({ deviceId: DEV_A, schemaVersion: SCHEMA_VERSION, changes: [{ nope: 1 }] }),
    });
    expect(response.status).toBe(400);
    expect(store.canonicalVersion(CENTER, 'students', S1)).toBe(0);
  });

  it('survives a hub restart without losing feed, cursors, or canonical state', async () => {
    const devA = device(DEV_A, USER_A);
    devA.write('students', S1, student(S1), ['phone'], USER_A);
    await devA.sync();

    // Stop the listener and start a fresh one over the same canonical store file.
    await server.stop();
    server = new HubServer(store, 0, '127.0.0.1');
    await server.start();

    // The hub's per-device cursor bookkeeping survived the restart.
    expect(store.cursorFor(DEV_A, CENTER)).toEqual({ seq: 1 });

    // A fresh device pulls the whole pre-restart feed, then pushes its own edit.
    const devB = device(DEV_B, USER_B);
    devB.write('students', S2, student(S2, { phone: '0622222222' }), ['phone'], USER_B);
    await devB.sync();
    expect(devB.entity('students', S1)?.['phone']).toBe('0611111111');
    expect(devB.entity('students', S2)?.['phone']).toBe('0622222222');

    // The hub host's own edits flow through the port after the restart too.
    const devH = device(DEV_H, USER_H);
    devH.write('students', S3, student(S3, { phone: '0633333333' }), ['phone'], USER_H);
    await devH.sync();
    await devB.sync();

    // The pre-restart hub host reconnects to the restarted hub and converges.
    const devA2 = device(DEV_A, USER_A);
    await devA2.sync();
    expect(devA2.entity('students', S1)?.['phone']).toBe('0611111111');
    expect(devA2.entity('students', S3)?.['phone']).toBe('0633333333');

    expect(stable(devA2)).toEqual(stable(devB));
    expect(stable(devB)).toEqual(stable(devH));
  });

  it('hub_feed is append-only at the DB layer', async () => {
    await clientFor().pushChanges({
      centreId: CENTER,
      deviceId: DEV_A,
      changes: [change(S1, 0)],
      schemaVersion: SCHEMA_VERSION,
    });
    expect(() => db.prepare('DELETE FROM hub_feed').run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE hub_feed SET op = 'delete'").run()).toThrow(/append-only/);
  });

  it('refuses a second center on a store already bound to one', async () => {
    store.registerCenter(CENTER, TOKEN, AT);
    expect(() => store.tokenFor('CS-OTHER-999' as CenterCode)).toThrow(/bound to center CS-CASA-001/);
    expect(() =>
      store.pull('CS-OTHER-999' as CenterCode, null, DEV_A),
    ).toThrow(/bound to center CS-CASA-001/);
    // The bound center keeps working — the guard only rejects a different tenant.
    expect(store.tokenFor(CENTER)).toBe(TOKEN);
  });
});
