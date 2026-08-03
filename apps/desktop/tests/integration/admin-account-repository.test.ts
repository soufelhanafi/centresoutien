import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { AdminAccount, AdminAccountId } from '@centresoutien/domain';
import { normalizeUsername } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { applyMigrations, loadMigrations, runMigrations } from '../../src/data/sqlite/migration-runner';
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

  it('findByUsername matches regardless of casing (SOU-153)', async () => {
    await repo.save(makeAccount({ username: 'Directrice' }));
    expect(await repo.findByUsername('directrice')).not.toBeNull();
    expect(await repo.findByUsername('DIRECTRICE')).not.toBeNull();
    expect(await repo.findByUsername('  DiREctrice  ')).not.toBeNull();
  });

  it('preserves the display username as typed while matching case-insensitively (SOU-153)', async () => {
    await repo.save(makeAccount({ username: 'Directrice' }));
    const found = await repo.findByUsername('DIRECTRICE');
    expect(found?.username).toBe('Directrice');
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

    it('rejects a duplicate username that only differs by casing (unique normalized index, SOU-153)', async () => {
      await repo.save(makeAccount({ username: 'Directrice' }));
      await expect(
        repo.save(
          makeAccount({
            id: 'adm_00000000000000000000000002' as AdminAccountId,
            username: 'DIRECTRICE',
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('migration 0031 backfill (SOU-153)', () => {
    it('backfills username_normalized to match normalizeUsername for a pre-existing non-ASCII username', async () => {
      // Separate temp DB (the shared `dir`/`db` from beforeEach is already
      // migrated to head) so we can apply migrations up to 0030 only, seed a
      // pre-SOU-153 row by hand, then run 0031 and inspect the backfill. Guards
      // against SQL's ASCII-only LOWER() silently diverging from the domain's
      // Unicode-aware normalizeUsername for an existing accented username.
      const preDir = mkdtempSync(join(tmpdir(), 'cs-admin-pre31-'));
      const migrations = loadMigrations(REAL_MIGRATIONS);
      const upTo30 = migrations.filter((m) => m.version <= 30);
      const only31 = migrations.filter((m) => m.version === 31);

      const preDb = openDatabase({ centreId: 'C1', key: KEY, dir: preDir });
      applyMigrations(preDb, upTo30);

      const rawUsername = 'Étudiante';
      preDb
        .prepare(
          `INSERT INTO admin_accounts (id, username, password_hash, created_at, updated_at)
           VALUES (@id, @username, @password_hash, @created_at, @updated_at)`,
        )
        .run({
          id: 'adm_00000000000000000000000003',
          username: rawUsername,
          password_hash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
          created_at: AT.toISOString(),
          updated_at: AT.toISOString(),
        });

      applyMigrations(preDb, only31);

      const row = preDb
        .prepare('SELECT username_normalized FROM admin_accounts WHERE id = ?')
        .get('adm_00000000000000000000000003') as { username_normalized: string };

      expect(row.username_normalized).toBe(normalizeUsername(rawUsername));

      const preRepo = new SqliteAdminAccountRepository(preDb);
      expect(await preRepo.findByUsername('  ÉTUDIANTE ')).not.toBeNull();

      preDb.close();
      rmSync(preDir, { recursive: true, force: true });
    });
  });
});
