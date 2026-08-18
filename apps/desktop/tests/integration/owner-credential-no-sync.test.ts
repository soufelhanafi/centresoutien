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

// SOU-252 deviation #3: the owner's credential lives in `users`, but changing it
// through the compatibility AdminAccountRepository (change-password / recovery
// reset) deliberately does NOT append to change_log — admin credentials were
// never synced pre-SOU-252, so the local owner login stays authoritative and
// lockout-free, and no half-fix silently starts (or half-starts) cross-device
// owner-credential divergence. These tests pin that: an owner password change
// updates the local row but adds no `users` change_log row. Employee accounts,
// by contrast, DO replicate (see user-repository / change-log tests).
const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-08-15T10:00:00Z');

/** Transparent test hasher: `hashed:<plain>` so a known hash can be seeded. */
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

function makeOwner(passwordHash: string): User {
  return {
    id: 'usr_00000000000000000000000001' as UserId,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    role: 'owner',
    username: 'directrice',
    passwordHash,
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: null,
    email: null,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cs-owner-nosync-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  users = new SqliteUserRepository(db, changeLogWriterForTest(db));
  adminRepo = new SqliteAdminAccountRepository(db);
  await users.save(makeOwner('hashed:OldPass1!'));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('owner credential is not replicated on change (SOU-252 deviation #3)', () => {
  it('ChangeAdminPassword updates the local hash but adds no users change_log row', async () => {
    const before = usersChangeLogCount();
    expect(before).toBe(1); // the initial owner save logged exactly one row

    await new ChangeAdminPassword(adminRepo, hasher, { now: () => AT }).execute({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass2!',
    });

    // Local behavior preserved: the owner's password is updated in place.
    expect((await adminRepo.findOnly())?.passwordHash).toBe('hashed:NewPass2!');
    // Deviation #3: the change is NOT logged, so it does not replicate.
    expect(usersChangeLogCount()).toBe(before);
  });
});
