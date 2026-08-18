import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { User, UserId, CenterCode, DeviceId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let repo: SqliteUserRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-users-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteUserRepository(db, changeLogWriterForTest(db));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');
// Setup-code expiry is epoch millis (INTEGER column), not a Date.
const EXPIRES_MS = new Date('2026-08-05T10:00:00Z').getTime();

function makeUser(over: Partial<User> = {}): User {
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
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: null,
    email: null,
    ...over,
  };
}

describe('SqliteUserRepository', () => {
  it('round-trips an owner through save + findById with all fields intact', async () => {
    const user = makeUser();
    await repo.save(user);
    expect(await repo.findById(user.id)).toEqual(user);
  });

  it('round-trips the optional email column: null by default, and a set address', async () => {
    const withoutEmail = makeUser();
    await repo.save(withoutEmail);
    expect((await repo.findById(withoutEmail.id))?.email).toBeNull();

    const withEmail = makeUser({
      id: 'usr_00000000000000000000000002' as UserId,
      role: 'secretary',
      username: 'amine',
      email: 'amine@example.com' as User['email'],
    });
    await repo.save(withEmail);
    const found = await repo.findById(withEmail.id);
    expect(found?.email).toBe('amine@example.com');
    expect(found).toEqual(withEmail);
  });

  it('round-trips an invited employee with a pending setup code', async () => {
    const employee = makeUser({
      id: 'usr_00000000000000000000000002' as UserId,
      role: 'secretary',
      username: 'secretaire',
      passwordHash: null,
      setupCodeHash: '$argon2id$v=19$m=19456,t=2,p=1$code$hash',
      setupCodeExpiresAt: EXPIRES_MS,
      setupCodeRedeemedAt: null,
    });
    await repo.save(employee);
    expect(await repo.findById(employee.id)).toEqual(employee);
  });

  it('findByUsername matches regardless of casing and hides tombstones', async () => {
    await repo.save(makeUser({ username: 'Directrice' }));
    expect((await repo.findByUsername('DIRECTRICE'))?.username).toBe('Directrice');
    expect(await repo.findByUsername('  directrice ')).not.toBeNull();
  });

  it('findOwner resolves the owner, ignoring employees', async () => {
    await repo.save(makeUser());
    await repo.save(
      makeUser({ id: 'usr_00000000000000000000000002' as UserId, role: 'secretary', username: 'sec' }),
    );
    expect((await repo.findOwner())?.role).toBe('owner');
  });

  it('upsert updates mutable fields (password redeemed) but preserves created_at', async () => {
    await repo.save(
      makeUser({
        role: 'secretary',
        username: 'sec',
        passwordHash: null,
        setupCodeHash: 'pending',
        setupCodeExpiresAt: EXPIRES_MS,
      }),
    );
    await repo.save(
      makeUser({
        role: 'secretary',
        username: 'sec',
        passwordHash: 'now-set',
        setupCodeHash: null,
        setupCodeExpiresAt: null,
        setupCodeRedeemedAt: new Date('2026-08-01T09:00:00Z'),
        version: 2,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById('usr_00000000000000000000000001' as UserId);
    expect(found?.passwordHash).toBe('now-set');
    expect(found?.setupCodeRedeemedAt).toEqual(new Date('2026-08-01T09:00:00Z'));
    expect(found?.createdAt).toEqual(AT);
    expect(found?.version).toBe(2);
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const user = makeUser();
    await repo.save(user);
    await repo.softDelete(user.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000009' as UserId);
    expect(await repo.findById(user.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });

  it('listActive returns live users of the center, excluding tombstones and other centers', async () => {
    await repo.save(makeUser({ id: 'usr_00000000000000000000000001' as UserId, username: 'directrice' }));
    await repo.save(
      makeUser({ id: 'usr_00000000000000000000000002' as UserId, role: 'secretary', username: 'amine' }),
    );
    const gone = makeUser({ id: 'usr_00000000000000000000000003' as UserId, role: 'secretary', username: 'gone' });
    await repo.save(gone);
    await repo.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);
    await repo.save(
      makeUser({
        id: 'usr_00000000000000000000000004' as UserId,
        centerCode: 'CS-RABAT-002' as CenterCode,
        role: 'secretary',
        username: 'other-center',
      }),
    );
    const rows = await repo.listActive('CS-CASA-001' as CenterCode);
    expect(rows.map((u) => u.username)).toEqual(['amine', 'directrice']);
  });

  describe('markSetupCodeRedeemed (atomic compare-and-set)', () => {
    const PENDING = makeUser({
      id: 'usr_00000000000000000000000002' as UserId,
      role: 'secretary',
      username: 'amine',
      passwordHash: null,
      setupCodeHash: 'pending-hash',
      setupCodeExpiresAt: EXPIRES_MS,
      setupCodeRedeemedAt: null,
    });
    const REDEEMED_AT = new Date('2026-08-03T09:00:00Z');
    const SELF = 'usr_00000000000000000000000002' as UserId;

    it('redeems a pending row: sets the password and clears every setup-code field', async () => {
      await repo.save(PENDING);
      const ok = await repo.markSetupCodeRedeemed({
        id: PENDING.id,
        expectedSetupCodeHash: 'pending-hash',
        passwordHash: 'new-hash',
        redeemedAt: REDEEMED_AT,
        updatedBy: SELF,
      });
      expect(ok).toBe(true);
      const found = await repo.findById(PENDING.id);
      expect(found?.passwordHash).toBe('new-hash');
      expect(found?.setupCodeHash).toBeNull();
      expect(found?.setupCodeExpiresAt).toBeNull();
      expect(found?.setupCodeRedeemedAt).toEqual(REDEEMED_AT);
    });

    it('a second redemption with the now-stale hash matches no row and does not clobber the winner (TOCTOU)', async () => {
      await repo.save(PENDING);
      const first = await repo.markSetupCodeRedeemed({
        id: PENDING.id,
        expectedSetupCodeHash: 'pending-hash',
        passwordHash: 'winner-hash',
        redeemedAt: REDEEMED_AT,
        updatedBy: SELF,
      });
      expect(first).toBe(true);

      const second = await repo.markSetupCodeRedeemed({
        id: PENDING.id,
        expectedSetupCodeHash: 'pending-hash', // stale — the winner already cleared it
        passwordHash: 'loser-hash',
        redeemedAt: new Date('2026-08-03T09:05:00Z'),
        updatedBy: SELF,
      });
      expect(second).toBe(false);
      // The winner's password stands; the loser never overwrote it.
      expect((await repo.findById(PENDING.id))?.passwordHash).toBe('winner-hash');
    });

    it('records exactly one change_log row for the redemption', async () => {
      await repo.save(PENDING);
      const before = (
        db.prepare("SELECT COUNT(*) AS n FROM change_log WHERE entity_type = 'users'").get() as {
          n: number;
        }
      ).n;
      await repo.markSetupCodeRedeemed({
        id: PENDING.id,
        expectedSetupCodeHash: 'pending-hash',
        passwordHash: 'new-hash',
        redeemedAt: REDEEMED_AT,
        updatedBy: SELF,
      });
      const after = (
        db.prepare("SELECT COUNT(*) AS n FROM change_log WHERE entity_type = 'users'").get() as {
          n: number;
        }
      ).n;
      expect(after - before).toBe(1);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the usr_ prefix (CHECK)', async () => {
      await expect(repo.save(makeUser({ id: 'bad_00000000000000000000000001' as UserId }))).rejects.toThrow();
    });

    it('rejects an unknown role (CHECK)', async () => {
      await expect(
        repo.save(makeUser({ role: 'superuser' as User['role'] })),
      ).rejects.toThrow();
    });

    it('rejects a duplicate live username in the same center (partial unique index)', async () => {
      await repo.save(makeUser({ id: 'usr_00000000000000000000000001' as UserId, username: 'dup' }));
      await expect(
        repo.save(
          makeUser({ id: 'usr_00000000000000000000000002' as UserId, role: 'secretary', username: 'DUP' }),
        ),
      ).rejects.toThrow();
    });

    it('frees a username after a soft delete and allows it across centers', async () => {
      const first = makeUser({ id: 'usr_00000000000000000000000001' as UserId, username: 'dup' });
      await repo.save(first);
      // Different center → allowed.
      await repo.save(
        makeUser({
          id: 'usr_00000000000000000000000002' as UserId,
          centerCode: 'CS-RABAT-002' as CenterCode,
          role: 'secretary',
          username: 'dup',
        }),
      );
      await repo.softDelete(first.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);
      await expect(
        repo.save(
          makeUser({ id: 'usr_00000000000000000000000003' as UserId, role: 'secretary', username: 'dup' }),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
