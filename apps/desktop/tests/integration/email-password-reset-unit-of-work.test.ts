import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  type AdminAccount,
  type AdminAccountId,
  type AuthAuditEvent,
  type AuthAuditEventId,
  type AuthAuditEventType,
  type DeviceSession,
  type DeviceSessionId,
  type EmailPasswordResetUnit,
  type User,
  type UserId,
  type CenterCode,
  type DeviceId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteAdminAccountRepository } from '../../src/data/sqlite/repositories/admin-account-repository';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { SqliteDeviceSessionStore } from '../../src/data/sqlite/repositories/device-session-store';
import { SqliteEmailPasswordResetUnitOfWork } from '../../src/data/sqlite/repositories/email-password-reset-unit-of-work';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-08-23T10:00:00Z');
const LATER = new Date('2026-08-24T09:00:00Z');

const OLD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$old$oldhash';
const NEW_HASH = '$argon2id$v=19$m=19456,t=2,p=1$new$newhash';

const ACCOUNT_ID = 'usr_00000000000000000000000001' as AdminAccountId;
const SESSION_ID = 'ses_00000000000000000000000001' as DeviceSessionId;

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

function makeAccount(
  passwordHash: string,
  updatedAt: Date,
  id: AdminAccountId = ACCOUNT_ID,
): AdminAccount {
  return { id, username: 'directrice', passwordHash, createdAt: AT, updatedAt };
}

function makeSession(): DeviceSession {
  return {
    id: SESSION_ID,
    createdAt: AT.getTime(),
    expiresAt: LATER.getTime(),
    userId: 'usr_00000000000000000000000001' as UserId,
  };
}

let seq = 1;
function auditEvent(eventType: AuthAuditEventType): AuthAuditEvent {
  return {
    id: `aaev_${String(seq++).padStart(26, '0')}` as AuthAuditEventId,
    eventType,
    username: 'directrice',
    timestamp: LATER,
    metadata: {},
  };
}

function makeUnit(over: Partial<EmailPasswordResetUnit> = {}): EmailPasswordResetUnit {
  return {
    account: makeAccount(NEW_HASH, LATER),
    // The seeded owner (written through SqliteUserRepository) participates in
    // sync, so the default reset replicates (SOU-258); the migrated test
    // overrides this to false.
    replicate: true,
    auditEvents: [auditEvent('password-reset-via-email')],
    deviceSessionInvalidatedEvent: auditEvent('device-session-invalidated-after-reset'),
    ...over,
  };
}

let dir: string;
let db: DB;
let accounts: SqliteAdminAccountRepository;
let sessions: SqliteDeviceSessionStore;
let uow: SqliteEmailPasswordResetUnitOfWork;

function auditCount(eventType: AuthAuditEventType): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM auth_audit_log WHERE event_type = ?')
    .get(eventType) as { n: number };
  return row.n;
}

function usersChangeLogCount(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM change_log WHERE entity_type = 'users'")
    .get() as { n: number };
  return row.n;
}

beforeEach(async () => {
  seq = 1;
  dir = mkdtempSync(join(tmpdir(), 'cs-email-reset-uow-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  accounts = new SqliteAdminAccountRepository(db, changeLogWriterForTest(db));
  sessions = new SqliteDeviceSessionStore(db);
  uow = new SqliteEmailPasswordResetUnitOfWork(db, changeLogWriterForTest(db));

  await new SqliteUserRepository(db, changeLogWriterForTest(db)).save(makeOwner(OLD_HASH));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteEmailPasswordResetUnitOfWork', () => {
  it('commits password, session clear, and audit rows together', async () => {
    await sessions.save(makeSession());
    const usersLoggedBefore = usersChangeLogCount();

    await uow.commit(makeUnit());

    expect((await accounts.findOnly())?.passwordHash).toBe(NEW_HASH);
    expect(await sessions.getCurrent()).toBeNull();
    expect(auditCount('password-reset-via-email')).toBe(1);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(1);
    // The rotated hash replicates to paired devices — exactly one users change_log row.
    expect(usersChangeLogCount()).toBe(usersLoggedBefore + 1);
  });

  it('skips the session clear and its audit row when no session is remembered', async () => {
    await uow.commit(makeUnit());

    expect((await accounts.findOnly())?.passwordHash).toBe(NEW_HASH);
    expect(auditCount('password-reset-via-email')).toBe(1);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(0);
  });

  it('rolls the whole reset back when a commit step throws (no partial state)', async () => {
    await sessions.save(makeSession());
    const usersLoggedBefore = usersChangeLogCount();

    // Force a mid-transaction failure by giving two audit rows the same primary
    // key: the first insert lands, the second collides and throws, and the whole
    // reset (password write + first audit row + change_log append) must roll back.
    const dupId = 'aaev_00000000000000000000000099' as AuthAuditEventId;
    await expect(
      uow.commit(
        makeUnit({
          auditEvents: [
            { id: dupId, eventType: 'password-reset-via-email', username: 'd', timestamp: LATER, metadata: {} },
            { id: dupId, eventType: 'password-reset-via-email', username: 'd', timestamp: LATER, metadata: {} },
          ],
        }),
      ),
    ).rejects.toThrow();

    expect((await accounts.findOnly())?.passwordHash).toBe(OLD_HASH);
    expect(await sessions.getCurrent()).not.toBeNull();
    expect(auditCount('password-reset-via-email')).toBe(0);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(0);
    // The change_log append lives inside the same transaction — it rolls back too.
    expect(usersChangeLogCount()).toBe(usersLoggedBefore);
  });

  it('keeps a migrated owner device-local: reset appends no users change_log row', async () => {
    const MIGRATED_ID = 'usr_00000000000000000000000002' as AdminAccountId;
    db.prepare("DELETE FROM users WHERE id = 'usr_00000000000000000000000001'").run();
    db.prepare(
      `INSERT INTO users
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
          version, role, username, username_normalized, password_hash,
          setup_code_hash, setup_code_expires_at, setup_code_redeemed_at)
       VALUES
         (?, 'CS-CASA-001', 'dev_00000000000000000000000002',
          '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z', ?,
          NULL, 0, 'owner', 'directrice', 'directrice', ?, NULL, NULL, NULL)`,
    ).run(MIGRATED_ID, MIGRATED_ID, OLD_HASH);
    const before = usersChangeLogCount();

    await uow.commit(
      makeUnit({ account: makeAccount(NEW_HASH, LATER, MIGRATED_ID), replicate: false }),
    );

    expect((await accounts.findOnly())?.passwordHash).toBe(NEW_HASH);
    expect(usersChangeLogCount()).toBe(before);
  });
});
