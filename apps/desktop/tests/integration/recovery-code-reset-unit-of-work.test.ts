import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  InvalidRecoveryCodeError,
  type AdminAccount,
  type AdminAccountId,
  type AuthAuditEvent,
  type AuthAuditEventId,
  type AuthAuditEventType,
  type DeviceSession,
  type DeviceSessionId,
  type RecoveryCode,
  type RecoveryCodeId,
  type RecoveryCodeResetUnit,
  type User,
  type UserId,
  type CenterCode,
  type DeviceId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteAdminAccountRepository } from '../../src/data/sqlite/repositories/admin-account-repository';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { SqliteRecoveryCodeRepository } from '../../src/data/sqlite/repositories/recovery-code-repository';
import { SqliteDeviceSessionStore } from '../../src/data/sqlite/repositories/device-session-store';
import { SqliteRecoveryCodeResetUnitOfWork } from '../../src/data/sqlite/repositories/recovery-code-reset-unit-of-work';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-08-10T10:00:00Z');
const LATER = new Date('2026-08-11T09:00:00Z');

const OLD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$old$oldhash';
const NEW_HASH = '$argon2id$v=19$m=19456,t=2,p=1$new$newhash';

// SOU-252: the owner credential lives in `users`; the AdminAccount id is that
// owner's usr_ id (AdminAccountRepository is now a view over it).
const ACCOUNT_ID = 'usr_00000000000000000000000001' as AdminAccountId;
const CODE_ID = 'rec_00000000000000000000000001' as RecoveryCodeId;
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
  };
}

function makeAccount(passwordHash: string, updatedAt: Date, id: AdminAccountId = ACCOUNT_ID): AdminAccount {
  return {
    id,
    username: 'directrice',
    passwordHash,
    createdAt: AT,
    updatedAt,
  };
}

function makeCode(): RecoveryCode {
  return {
    id: CODE_ID,
    codeHash: '$argon2id$v=19$m=19456,t=2,p=1$code$codehash',
    consumed: false,
    createdAt: AT,
    consumedAt: null,
  };
}

function makeSession(): DeviceSession {
  return { id: SESSION_ID, createdAt: AT.getTime(), expiresAt: LATER.getTime() };
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

function makeUnit(over: Partial<RecoveryCodeResetUnit> = {}): RecoveryCodeResetUnit {
  return {
    account: makeAccount(NEW_HASH, LATER),
    // The seeded owner (written through SqliteUserRepository) participates in
    // sync, so the default reset replicates (SOU-258); the migrated test
    // overrides this to false.
    replicate: true,
    consumedCodeId: CODE_ID,
    consumedAt: LATER,
    auditEvents: [auditEvent('recovery-code-consumed'), auditEvent('password-reset-via-recovery-code')],
    deviceSessionInvalidatedEvent: auditEvent('device-session-invalidated-after-reset'),
    onCodeAlreadyConsumed: () => new InvalidRecoveryCodeError(),
    ...over,
  };
}

let dir: string;
let db: DB;
let accounts: SqliteAdminAccountRepository;
let codes: SqliteRecoveryCodeRepository;
let sessions: SqliteDeviceSessionStore;
let uow: SqliteRecoveryCodeResetUnitOfWork;

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
  dir = mkdtempSync(join(tmpdir(), 'cs-reset-uow-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  accounts = new SqliteAdminAccountRepository(db, changeLogWriterForTest(db));
  codes = new SqliteRecoveryCodeRepository(db);
  sessions = new SqliteDeviceSessionStore(db);
  uow = new SqliteRecoveryCodeResetUnitOfWork(db, changeLogWriterForTest(db));

  // Seed the owner in `users` (the credential store); AdminAccountRepository is a
  // view over it, and the UoW's ADMIN_ACCOUNT_SAVE_SQL updates its password_hash.
  await new SqliteUserRepository(db, changeLogWriterForTest(db)).save(makeOwner(OLD_HASH));
  await codes.saveMany([makeCode()]);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteRecoveryCodeResetUnitOfWork', () => {
  it('commits password, consume, session clear, and all audit rows together', async () => {
    await sessions.save(makeSession());
    // The seeded owner (written through SqliteUserRepository) is sync-
    // participating, so the reset appends exactly one users change_log row
    // (SOU-258) — the rotated hash replicates to paired devices.
    const usersLoggedBefore = usersChangeLogCount();

    await uow.commit(makeUnit());

    expect((await accounts.findOnly())?.passwordHash).toBe(NEW_HASH);
    expect(await codes.countUnconsumed()).toBe(0);
    expect(await sessions.getCurrent()).toBeNull();
    expect(auditCount('recovery-code-consumed')).toBe(1);
    expect(auditCount('password-reset-via-recovery-code')).toBe(1);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(1);
    expect(usersChangeLogCount()).toBe(usersLoggedBefore + 1);
  });

  it('skips the session clear and its audit row when no session is remembered', async () => {
    await uow.commit(makeUnit());

    expect((await accounts.findOnly())?.passwordHash).toBe(NEW_HASH);
    expect(await codes.countUnconsumed()).toBe(0);
    expect(auditCount('password-reset-via-recovery-code')).toBe(1);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(0);
  });

  it('rolls the whole reset back when the code was already consumed (no partial state)', async () => {
    await sessions.save(makeSession());
    await codes.consumeById(CODE_ID, AT);
    const usersLoggedBefore = usersChangeLogCount();

    await expect(uow.commit(makeUnit())).rejects.toBeInstanceOf(InvalidRecoveryCodeError);

    expect((await accounts.findOnly())?.passwordHash).toBe(OLD_HASH);
    expect(await sessions.getCurrent()).not.toBeNull();
    expect(auditCount('recovery-code-consumed')).toBe(0);
    expect(auditCount('password-reset-via-recovery-code')).toBe(0);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(0);
    // The change_log append lives inside the same transaction — it rolls back too.
    expect(usersChangeLogCount()).toBe(usersLoggedBefore);
  });

  it('keeps a migrated owner device-local: reset appends no users change_log row', async () => {
    const MIGRATED_ID = 'usr_00000000000000000000000002' as AdminAccountId;
    // The beforeEach seeds a fresh owner (which logs); drop the row so the
    // migrated owner below owns the single username slot. change_log is
    // append-only, so its seeded entry stays — it does not touch the migrated id.
    db.prepare("DELETE FROM users WHERE id = 'usr_00000000000000000000000001'").run();
    // Migration 0044 backfills the owner with a raw INSERT and NO change_log row.
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
    expect(await codes.countUnconsumed()).toBe(0);
    // Preserved: the migrated owner stays device-local — no change_log row for it.
    expect(usersChangeLogCount()).toBe(before);
  });
});
