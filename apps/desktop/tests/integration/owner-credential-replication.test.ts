import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  ChangeAdminPassword,
  type PasswordHasher,
  type User,
  type UserId,
  type CenterCode,
  type DeviceId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteAdminAccountRepository } from '../../src/data/sqlite/repositories/admin-account-repository';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { changeLogWriterForTest } from './helpers/change-log';

// SOU-258: an owner created through the sync-aware path (SqliteUserRepository,
// which appends change_log) has its password rotations and recovery resets
// replicated to paired devices. A MIGRATED owner — backfilled by migration 0044
// with a device-local ULID and NO change_log / sync presence — stays
// device-local on purpose: pushing it would collide on ux_users_username_live.
// These tests pin that split: fresh owners log credential changes, migrated
// owners do not.
const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-08-15T10:00:00Z');

// Transparent test hasher: `hashed:<plain>` so a known hash can be seeded.
const hasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  verify: async (hash, plain) => hash === `hashed:${plain}`,
};

let dir: string;
let db: DB;
let users: SqliteUserRepository;
let adminRepo: SqliteAdminAccountRepository;

function usersChangeLogCount(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM change_log WHERE entity_type = 'users'")
    .get() as { n: number };
  return row.n;
}

function makeOwner(passwordHash: string, id = 'usr_00000000000000000000000001'): User {
  return {
    id: id as UserId,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: id as UserId,
    deletedAt: null,
    version: 0,
    role: 'owner',
    username: 'directrice',
    passwordHash,
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: null,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cs-owner-repl-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  users = new SqliteUserRepository(db, changeLogWriterForTest(db));
  adminRepo = new SqliteAdminAccountRepository(db, changeLogWriterForTest(db));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('owner credential changes replicate when the owner is sync-participating (SOU-258)', () => {
  it('ChangeAdminPassword appends a users change_log row for an owner created through the sync path', async () => {
    await users.save(makeOwner('hashed:OldPass1!'));
    const before = usersChangeLogCount();
    expect(before).toBe(1); // the initial owner save logged exactly one row

    await new ChangeAdminPassword(adminRepo, hasher, { now: () => AT }).execute({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass2!',
    });

    expect((await adminRepo.findOnly())?.passwordHash).toBe('hashed:NewPass2!');
    // SOU-258: the rotation IS logged now, so it replicates to paired devices.
    expect(usersChangeLogCount()).toBe(before + 1);
  });

  it('ChangeAdminPassword logs for an owner that arrived via sync (sync_local_entity presence)', async () => {
    // An owner pulled from the hub has a sync_local_entity shadow row but no
    // change_log history (inbound applies do not log). Its rotation must still
    // replicate back to the other laptops.
    await users.save(makeOwner('hashed:OldPass1!'));
    db.prepare(
      `INSERT INTO sync_local_entity (entity_type, entity_id, version, entity_json, pending_json, blocked, conflict_json, center_code)
       VALUES ('users', 'usr_00000000000000000000000001', 3, '{}', NULL, 0, NULL, 'CS-CASA-001')`,
    ).run();
    const before = usersChangeLogCount();

    await new ChangeAdminPassword(adminRepo, hasher, { now: () => AT }).execute({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass2!',
    });

    expect(usersChangeLogCount()).toBe(before + 1);
  });
});

describe('a migrated owner stays device-local (SOU-258)', () => {
  it('ChangeAdminPassword does NOT log for a backfilled owner with no sync presence', async () => {
    // Migration 0044 backfills the owner with a raw INSERT and NO change_log row;
    // this is the device-local migrated-owner case that must stay that way.
    db.prepare(
      `INSERT INTO users
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
          version, role, username, username_normalized, password_hash,
          setup_code_hash, setup_code_expires_at, setup_code_redeemed_at)
       VALUES
         ('usr_00000000000000000000000002', 'CS-CASA-001', 'dev_00000000000000000000000002',
          '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z', 'usr_00000000000000000000000002',
          NULL, 0, 'owner', 'directrice', 'directrice', 'hashed:OldPass1!', NULL, NULL, NULL)`,
    ).run();
    expect(usersChangeLogCount()).toBe(0);

    await new ChangeAdminPassword(adminRepo, hasher, { now: () => AT }).execute({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass2!',
    });

    expect((await adminRepo.findOnly())?.passwordHash).toBe('hashed:NewPass2!');
    // Preserved: the migrated owner stays device-local — no change_log row.
    expect(usersChangeLogCount()).toBe(0);
  });
});
