import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { User, UserId, CenterCode, DeviceId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteAdminAccountRepository } from '../../src/data/sqlite/repositories/admin-account-repository';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { changeLogWriterForTest } from './helpers/change-log';

// SOU-252: AdminAccountRepository is now a compatibility VIEW over the owner
// `users` row (change-password / recovery-reset still use its port). These tests
// pin that mapping — the credential store is `users`, whichever path reads it.
const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-07-29T10:00:00Z');

let dir: string;
let db: DB;
let repo: SqliteAdminAccountRepository;
let users: SqliteUserRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-admin-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteAdminAccountRepository(db, changeLogWriterForTest(db));
  users = new SqliteUserRepository(db, changeLogWriterForTest(db));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeOwner(over: Partial<User> = {}): User {
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
    fullName: null,
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: null,
    email: null,
    permissions: new Set(),
    ...over,
  };
}

describe('SqliteAdminAccountRepository (compat view over users owner)', () => {
  it('exists reflects whether an owner user is present', async () => {
    expect(await repo.exists()).toBe(false);
    await users.save(makeOwner());
    expect(await repo.exists()).toBe(true);
  });

  it('findOnly resolves the owner as an AdminAccount', async () => {
    await users.save(makeOwner());
    const account = await repo.findOnly();
    expect(account?.id).toBe('usr_00000000000000000000000001');
    expect(account?.username).toBe('directrice');
    expect(account?.passwordHash).toBe('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
  });

  it('findByUsername matches regardless of casing (SOU-153)', async () => {
    await users.save(makeOwner({ username: 'Directrice' }));
    expect(await repo.findByUsername('directrice')).not.toBeNull();
    expect((await repo.findByUsername('  DIRECTRICE '))?.username).toBe('Directrice');
  });

  it('findByUsername is owner-scoped: an employee username never resolves as the admin', async () => {
    await users.save(makeOwner());
    await users.save(
      makeOwner({
        id: 'usr_00000000000000000000000002' as UserId,
        role: 'secretary',
        username: 'amine',
        passwordHash: 'employee-hash',
      }),
    );
    // The employee exists in `users`, but this compat view must not surface it —
    // otherwise an owner password write would mutate the employee's row.
    expect(await repo.findByUsername('amine')).toBeNull();
    expect((await repo.findByUsername('directrice'))?.id).toBe('usr_00000000000000000000000001');
  });

  it('save updates the password hash on the owner row without touching created_at', async () => {
    await users.save(makeOwner());
    const account = await repo.findOnly();
    if (!account) throw new Error('expected owner');
    account.passwordHash = '$argon2id$v=19$m=19456,t=2,p=1$new$hash';
    account.updatedAt = new Date('2026-08-01T09:00:00Z');
    await repo.save(account);

    const reread = await repo.findOnly();
    expect(reread?.passwordHash).toBe('$argon2id$v=19$m=19456,t=2,p=1$new$hash');
    expect(reread?.updatedAt).toEqual(new Date('2026-08-01T09:00:00Z'));
    // The underlying user row keeps its identity/created_at.
    const row = db.prepare('SELECT created_at, role FROM users WHERE id = ?').get('usr_00000000000000000000000001') as {
      created_at: string;
      role: string;
    };
    expect(new Date(row.created_at)).toEqual(AT);
    expect(row.role).toBe('owner');
  });

  it('ignores a tombstoned owner', async () => {
    const owner = makeOwner();
    await users.save(owner);
    await users.softDelete(owner.id, new Date('2026-08-02T00:00:00Z'), owner.id);
    expect(await repo.exists()).toBe(false);
    expect(await repo.findOnly()).toBeNull();
  });
});
