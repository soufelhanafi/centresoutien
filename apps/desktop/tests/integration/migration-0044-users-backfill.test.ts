import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import { openDatabase } from '../../src/data/sqlite/db';
import { applyMigrations, loadMigrations } from '../../src/data/sqlite/migration-runner';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = '2026-07-29T10:00:00Z';

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-users-migrate-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Apply every migration strictly before the users migration. */
function migrateToBeforeUsers() {
  const migrations = loadMigrations(REAL_MIGRATIONS);
  const usersMigration = migrations.find((m) => m.name.includes('users'));
  if (!usersMigration) throw new Error('0044_users migration not found');
  applyMigrations(
    db,
    migrations.filter((m) => m.version < usersMigration.version),
  );
  return usersMigration;
}

function seedCenter() {
  db.prepare(
    `INSERT INTO center (id, center_code, device_origin, created_at, updated_at, updated_by, name)
     VALUES (@id, @center_code, @device_origin, @at, @at, @updated_by, @name)`,
  ).run({
    id: 'ctr_00000000000000000000000001',
    center_code: 'CS-CASA-001',
    device_origin: 'dev_00000000000000000000000007',
    at: AT,
    updated_by: 'usr_seed',
    name: 'Centre Test',
  });
}

function seedAdmin(username: string) {
  db.prepare(
    `INSERT INTO admin_accounts (id, username, username_normalized, password_hash, created_at, updated_at)
     VALUES (@id, @username, @username_normalized, @password_hash, @at, @at)`,
  ).run({
    id: 'adm_00000000000000000000000ABC',
    username,
    username_normalized: username.trim().toLowerCase(),
    password_hash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
    at: AT,
  });
}

describe('migration 0044 AdminAccount -> owner User backfill', () => {
  it('copies the existing admin into users as the owner, sourcing center_code/device_origin from the center', () => {
    const usersMigration = migrateToBeforeUsers();
    seedCenter();
    seedAdmin('Directrice');

    applyMigrations(db, [usersMigration]);

    const owner = db
      .prepare("SELECT * FROM users WHERE role = 'owner'")
      .get() as Record<string, unknown>;

    // Same ULID, prefix swapped adm_ -> usr_.
    expect(owner.id).toBe('usr_00000000000000000000000ABC');
    expect(owner.updated_by).toBe('usr_00000000000000000000000ABC');
    expect(owner.center_code).toBe('CS-CASA-001');
    expect(owner.device_origin).toBe('dev_00000000000000000000000007');
    expect(owner.username).toBe('Directrice');
    expect(owner.username_normalized).toBe('directrice');
    expect(owner.password_hash).toBe('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
    expect(owner.version).toBe(0);
    expect(owner.deleted_at).toBeNull();
    expect(owner.password_hash).not.toBeNull();
  });

  it('inserts nothing on a fresh center with no admin row', () => {
    const usersMigration = migrateToBeforeUsers();
    seedCenter();

    applyMigrations(db, [usersMigration]);

    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('is idempotent: re-running the backfill never duplicates the owner', () => {
    const usersMigration = migrateToBeforeUsers();
    seedCenter();
    seedAdmin('directrice');
    applyMigrations(db, [usersMigration]);

    // Re-execute only the guarded INSERT (the CREATE TABLE part already ran) to
    // prove the NOT EXISTS guard: a replay must not add a second owner.
    const insertSql = usersMigration.sql.slice(usersMigration.sql.indexOf('INSERT INTO users'));
    db.exec(insertSql);

    const count = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  it('leaves the schema migratable to head afterwards', () => {
    migrateToBeforeUsers();
    seedCenter();
    seedAdmin('directrice');
    // Applying the remaining migrations (0044 + any later) must not throw.
    expect(() => applyMigrations(db, loadMigrations(REAL_MIGRATIONS))).not.toThrow();
    expect(readFileSync(join(REAL_MIGRATIONS, '0044_users.sql'), 'utf8')).toContain('CREATE TABLE users');
  });
});
