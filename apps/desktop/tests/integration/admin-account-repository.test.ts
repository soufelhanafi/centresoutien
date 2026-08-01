import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { AdminAccount, AdminAccountId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteAdminAccountRepository } from '../../src/data/sqlite/repositories/admin-account-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let repo: SqliteAdminAccountRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-admin-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteAdminAccountRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

function makeAccount(over: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: 'adm_00000000000000000000000001' as AdminAccountId,
    username: 'directrice',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

describe('SqliteAdminAccountRepository', () => {
  it('round-trips an account through save + findByUsername with all fields intact', async () => {
    const account = makeAccount();
    await repo.save(account);
    expect(await repo.findByUsername('directrice')).toEqual(account);
  });

  it('findByUsername returns null for an unknown username', async () => {
    expect(await repo.findByUsername('ghost')).toBeNull();
  });

  it('exists reflects whether any account is present', async () => {
    expect(await repo.exists()).toBe(false);
    await repo.save(makeAccount());
    expect(await repo.exists()).toBe(true);
  });

  it('findOnly resolves the sole account, or null before one is created', async () => {
    expect(await repo.findOnly()).toBeNull();
    await repo.save(makeAccount());
    expect(await repo.findOnly()).toEqual(makeAccount());
  });

  it('upsert updates the hash and updated_at but preserves created_at', async () => {
    await repo.save(makeAccount());
    await repo.save(
      makeAccount({
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$new$hash',
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findByUsername('directrice');
    expect(found?.passwordHash).toBe('$argon2id$v=19$m=19456,t=2,p=1$new$hash');
    expect(found?.updatedAt).toEqual(new Date('2026-08-01T09:00:00Z'));
    expect(found?.createdAt).toEqual(AT);
  });

  describe('DB constraints', () => {
    it('rejects an id without the adm_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeAccount({ id: 'bad_00000000000000000000000001' as AdminAccountId })),
      ).rejects.toThrow();
    });

    it('rejects a duplicate username (unique index)', async () => {
      await repo.save(makeAccount());
      await expect(
        repo.save(makeAccount({ id: 'adm_00000000000000000000000002' as AdminAccountId })),
      ).rejects.toThrow();
    });
  });
});
