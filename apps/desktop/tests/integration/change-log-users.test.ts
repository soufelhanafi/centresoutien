import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { User, UserId, CenterCode, DeviceId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { replayChangeLog } from '../../src/data/sqlite/change-log/replay-change-log';

// SOU-252: proves the registered `users` change-log mapper reprojects a User onto
// the physical `users` row faithfully — the exact path that makes an invited
// employee created on laptop A actually land (and be able to log in) on laptop B.
// Guards against silent column drift breaking employee replication.
const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const ROW_ORIGIN = 'dev_00000000000000000000000001' as DeviceId;
const ACTING_DEVICE = 'dev_00000000000000000000000009' as DeviceId;
const AT = new Date('2026-08-15T10:00:00Z');

let dir: string;
let db: DB;
let repo: SqliteUserRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-changelog-users-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteUserRepository(db, new SqliteChangeLogWriter(db, { now: () => AT }, ACTING_DEVICE));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'usr_00000000000000000000000001' as UserId,
    centerCode: CENTER,
    deviceOrigin: ROW_ORIGIN,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    role: 'owner',
    username: 'directrice',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: null,
    ...over,
  };
}

function logRows(database: DB) {
  return database.prepare('SELECT * FROM change_log ORDER BY rowid').all() as Record<
    string,
    unknown
  >[];
}

function copyChangeLog(source: DB, target: DB): void {
  const insert = target.prepare(
    `INSERT INTO change_log
       (entity_type, entity_id, revision, op, payload, device_id, created_at, center_code)
     VALUES (@entity_type, @entity_id, @revision, @op, @payload, @device_id, @created_at, @center_code)`,
  );
  for (const row of logRows(source)) insert.run(row);
}

describe('change_log — users reprojection (SOU-252)', () => {
  it('rebuilds the users table on another device via replay, owner + invited employee intact', async () => {
    const owner = makeUser();
    // An invited employee: no password yet, a pending hashed setup code with an
    // expiry — the fields that must survive the wire for laptop B to redeem.
    const employee = makeUser({
      id: 'usr_00000000000000000000000002' as UserId,
      role: 'secretary',
      username: 'amine',
      passwordHash: null,
      setupCodeHash: '$argon2id$v=19$m=19456,t=2,p=1$code$hash',
      setupCodeExpiresAt: new Date('2026-08-22T10:00:00Z'),
      setupCodeRedeemedAt: null,
    });
    await repo.save(owner);
    await repo.save(employee);

    const sourceRows = db.prepare('SELECT * FROM users ORDER BY id').all();

    const targetDir = mkdtempSync(join(tmpdir(), 'cs-changelog-users-target-'));
    const target = openDatabase({ centreId: 'C2', key: KEY, dir: targetDir });
    try {
      runMigrations(target, REAL_MIGRATIONS);
      copyChangeLog(db, target);
      // The other device starts with no users; replay applies the pulled payloads.
      expect(target.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 });

      replayChangeLog(target);

      const rebuilt = target.prepare('SELECT * FROM users ORDER BY id').all();
      expect(rebuilt).toEqual(sourceRows);
      // Replay upserts directly — it must not append new log rows.
      expect(logRows(target)).toHaveLength(logRows(db).length);
    } finally {
      target.close();
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it('reprojects a redeemed employee so the credential + redemption stamp land on laptop B', async () => {
    const redeemed = makeUser({
      id: 'usr_00000000000000000000000003' as UserId,
      role: 'secretary',
      username: 'yassine',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$new$hash',
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      setupCodeRedeemedAt: new Date('2026-08-16T09:00:00Z'),
    });
    await repo.save(redeemed);

    const targetDir = mkdtempSync(join(tmpdir(), 'cs-changelog-users-target2-'));
    const target = openDatabase({ centreId: 'C2', key: KEY, dir: targetDir });
    try {
      runMigrations(target, REAL_MIGRATIONS);
      copyChangeLog(db, target);
      replayChangeLog(target);

      const projected = new SqliteUserRepository(
        target,
        new SqliteChangeLogWriter(target, { now: () => AT }, ACTING_DEVICE),
      );
      // Read back through the domain shape: every field survived the round-trip.
      expect(await projected.findById(redeemed.id)).toEqual(redeemed);
    } finally {
      target.close();
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
