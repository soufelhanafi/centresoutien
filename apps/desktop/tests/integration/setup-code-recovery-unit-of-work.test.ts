import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  SetupCodeAlreadyRedeemedError,
  type AuthAuditEvent,
  type AuthAuditEventId,
  type AuthAuditEventType,
  type DeviceSession,
  type DeviceSessionId,
  type SetupCodeRecoveryUnit,
  type User,
  type UserId,
  type CenterCode,
  type DeviceId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { SqliteDeviceSessionStore } from '../../src/data/sqlite/repositories/device-session-store';
import { SqliteSetupCodeRecoveryUnitOfWork } from '../../src/data/sqlite/repositories/setup-code-recovery-unit-of-work';
import { changeLogWriterForTest } from './helpers/change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const AT = new Date('2026-08-23T10:00:00Z');
const LATER = new Date('2026-08-24T09:00:00Z');
const EXPIRES_MS = new Date('2026-08-30T10:00:00Z').getTime();

const OLD_PW = '$argon2id$v=19$m=19456,t=2,p=1$old$oldhash';
const NEW_PW = '$argon2id$v=19$m=19456,t=2,p=1$new$newhash';
const PENDING_CODE = '$argon2id$v=19$m=19456,t=2,p=1$code$codehash';

const STAFF_ID = 'usr_00000000000000000000000002' as UserId;
const SESSION_ID = 'ses_00000000000000000000000001' as DeviceSessionId;

// An already-onboarded secretary whose director re-issued a code: real identity +
// an existing password + a fresh pending setup code.
function makeStaff(): User {
  return {
    id: STAFF_ID,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: STAFF_ID,
    deletedAt: null,
    version: 0,
    role: 'secretary',
    username: 'sanaa',
    fullName: 'Sanaa Bennani',
    passwordHash: OLD_PW,
    setupCodeHash: PENDING_CODE,
    setupCodeExpiresAt: EXPIRES_MS,
    setupCodeRedeemedAt: null,
    email: 'sanaa@centre.ma' as User['email'],
  };
}

function makeSession(): DeviceSession {
  return { id: SESSION_ID, createdAt: AT.getTime(), expiresAt: LATER.getTime(), userId: STAFF_ID };
}

let seq = 1;
function auditEvent(eventType: AuthAuditEventType): AuthAuditEvent {
  return {
    id: `aaev_${String(seq++).padStart(26, '0')}` as AuthAuditEventId,
    eventType,
    username: 'sanaa',
    timestamp: LATER,
    metadata: {},
  };
}

function makeUnit(over: Partial<SetupCodeRecoveryUnit> = {}): SetupCodeRecoveryUnit {
  return {
    id: STAFF_ID,
    expectedSetupCodeHash: PENDING_CODE,
    passwordHash: NEW_PW,
    redeemedAt: LATER,
    updatedBy: STAFF_ID,
    replicate: true,
    auditEvents: [auditEvent('password-reset-via-setup-code')],
    deviceSessionInvalidatedEvent: auditEvent('device-session-invalidated-after-reset'),
    onCodeAlreadyRedeemed: () => new SetupCodeAlreadyRedeemedError(),
    ...over,
  };
}

let dir: string;
let db: DB;
let users: SqliteUserRepository;
let sessions: SqliteDeviceSessionStore;
let uow: SqliteSetupCodeRecoveryUnitOfWork;

function auditCount(eventType: AuthAuditEventType): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM auth_audit_log WHERE event_type = ?').get(eventType) as {
      n: number;
    }
  ).n;
}
function usersChangeLogCount(): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM change_log WHERE entity_type = 'users'").get() as {
      n: number;
    }
  ).n;
}

beforeEach(async () => {
  seq = 1;
  dir = mkdtempSync(join(tmpdir(), 'cs-setup-recovery-uow-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  users = new SqliteUserRepository(db, changeLogWriterForTest(db));
  sessions = new SqliteDeviceSessionStore(db);
  uow = new SqliteSetupCodeRecoveryUnitOfWork(db, changeLogWriterForTest(db));
  await users.save(makeStaff());
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteSetupCodeRecoveryUnitOfWork', () => {
  it('rotates the password, clears the code, clears the session, and logs it — all together', async () => {
    await sessions.save(makeSession());
    const loggedBefore = usersChangeLogCount();

    await uow.commit(makeUnit());

    const found = await users.findById(STAFF_ID);
    expect(found?.passwordHash).toBe(NEW_PW);
    expect(found?.setupCodeHash).toBeNull();
    expect(found?.setupCodeRedeemedAt).not.toBeNull();
    // Identity is untouched by a recovery.
    expect(found?.username).toBe('sanaa');
    expect(found?.fullName).toBe('Sanaa Bennani');
    expect(await sessions.getCurrent()).toBeNull();
    expect(auditCount('password-reset-via-setup-code')).toBe(1);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(1);
    expect(usersChangeLogCount()).toBe(loggedBefore + 1);
  });

  it('skips the session clear and its audit row when no session is remembered', async () => {
    await uow.commit(makeUnit());
    expect(auditCount('password-reset-via-setup-code')).toBe(1);
    expect(auditCount('device-session-invalidated-after-reset')).toBe(0);
  });

  it('raises onCodeAlreadyRedeemed and rolls everything back when the code is stale (CAS)', async () => {
    await sessions.save(makeSession());
    await expect(
      uow.commit(makeUnit({ expectedSetupCodeHash: 'stale-hash' })),
    ).rejects.toBeInstanceOf(SetupCodeAlreadyRedeemedError);

    // Nothing applied: password unchanged, session intact, no audit rows.
    expect((await users.findById(STAFF_ID))?.passwordHash).toBe(OLD_PW);
    expect(await sessions.getCurrent()).not.toBeNull();
    expect(auditCount('password-reset-via-setup-code')).toBe(0);
  });

  it('rolls the whole recovery back when a commit step throws (no partial state)', async () => {
    await sessions.save(makeSession());
    const loggedBefore = usersChangeLogCount();
    const dupId = 'aaev_00000000000000000000000099' as AuthAuditEventId;
    await expect(
      uow.commit(
        makeUnit({
          auditEvents: [
            { id: dupId, eventType: 'password-reset-via-setup-code', username: 's', timestamp: LATER, metadata: {} },
            { id: dupId, eventType: 'password-reset-via-setup-code', username: 's', timestamp: LATER, metadata: {} },
          ],
        }),
      ),
    ).rejects.toThrow();

    expect((await users.findById(STAFF_ID))?.passwordHash).toBe(OLD_PW);
    expect(await sessions.getCurrent()).not.toBeNull();
    expect(auditCount('password-reset-via-setup-code')).toBe(0);
    expect(usersChangeLogCount()).toBe(loggedBefore);
  });

  it('stays device-local when replicate is false: no users change_log row', async () => {
    const before = usersChangeLogCount();
    await uow.commit(makeUnit({ replicate: false }));
    expect((await users.findById(STAFF_ID))?.passwordHash).toBe(NEW_PW);
    expect(usersChangeLogCount()).toBe(before);
  });
});
