import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  CenterProfileInput,
  DeviceId,
  IdGenerator,
  User,
  UserId,
} from '@centresoutien/domain';
import { CenterProvisioningError } from '@centresoutien/domain';
import { centreDbFileName, openDatabase } from '../../src/data/sqlite/db';
import { loadMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteCenterProvisioning } from '../../src/data/sqlite/center-provisioning';

const KEY = 'passphrase-under-test';
const DIRECTOR = 'usr_00000000000000000000000009' as UserId;
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

const OWNER: User = {
  id: DIRECTOR,
  centerCode: 'CS-HOME-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  updatedBy: DIRECTOR,
  deletedAt: null,
  version: 0,
  role: 'owner',
  username: 'directrice',
  passwordHash: '$argon2id$v=19$m=1,t=1,p=1$abc$def',
  setupCodeHash: null,
  setupCodeExpiresAt: null,
  setupCodeRedeemedAt: null,
  email: null,
};

function counterIds(seed = 1): IdGenerator {
  let n = seed;
  return { next: <T extends string = string>(prefix: string) => `${prefix}_${String(n++).padStart(26, '0')}` as T };
}

function fixedClock(iso = '2026-08-23T10:00:00Z') {
  const now = new Date(iso);
  return { now: () => now };
}

function profile(over: Partial<CenterProfileInput> = {}): CenterProfileInput {
  return { name: 'Centre Annexe', address: '', phone: '', email: 'annexe@ilm.ma', ...over };
}

function makeProvisioner(dir: string, over: { hasActiveLicense?: boolean; idsSeed?: number } = {}) {
  return new SqliteCenterProvisioning({
    dir,
    keyFor: () => KEY,
    migrations: loadMigrations(REAL_MIGRATIONS),
    clock: fixedClock(),
    ids: counterIds(over.idsSeed ?? 1),
    hasActiveLicense: () => over.hasActiveLicense ?? false,
    seedPlan: 'premium',
    currentOwner: async () => OWNER,
  });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-provision-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteCenterProvisioning', () => {
  it('creates a fully seeded, isolated per-center DB', async () => {
    const result = await makeProvisioner(dir).provision({ profile: profile() });

    expect(existsSync(join(dir, centreDbFileName(result.centreId)))).toBe(true);
    expect(result.centerCode).toMatch(/^CS-/);

    const db: DB = openDatabase({ centreId: result.centreId, key: KEY, dir });
    try {
      const center = db.prepare('SELECT name, center_code, plan FROM center').get() as {
        name: string;
        center_code: string;
        plan: string;
      };
      expect(center.name).toBe('Centre Annexe');
      expect(center.center_code).toBe(result.centerCode);
      expect(center.plan).toBe('premium');

      const hours = db.prepare('SELECT COUNT(*) AS n FROM center_hours').get() as { n: number };
      expect(hours.n).toBe(7);
      const niveaux = db.prepare('SELECT COUNT(*) AS n FROM niveaux').get() as { n: number };
      expect(niveaux.n).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it('seeds the org + the director as owner, with centre_id equal to the center code', async () => {
    const result = await makeProvisioner(dir).provision({ profile: profile() });

    const db: DB = openDatabase({ centreId: result.centreId, key: KEY, dir });
    try {
      const org = db.prepare('SELECT name, billing_contact, center_code FROM organization').get() as {
        name: string;
        billing_contact: string;
        center_code: string;
      };
      expect(org.name).toBe('Centre Annexe');
      expect(org.billing_contact).toBe('annexe@ilm.ma');
      expect(org.center_code).toBe(result.centerCode);

      const membership = db
        .prepare('SELECT user_id, centre_id, center_code, role FROM membership')
        .get() as { user_id: string; centre_id: string; center_code: string; role: string };
      expect(membership.user_id).toBe(DIRECTOR);
      expect(membership.role).toBe('owner');
      // AuthorizeCenterAccess trusts a membership only when both equal the selected center.
      expect(membership.centre_id).toBe(result.centerCode);
      expect(membership.center_code).toBe(result.centerCode);
    } finally {
      db.close();
    }
  });

  it('publishes the final file atomically, leaving no .provisioning temp behind', async () => {
    const result = await makeProvisioner(dir).provision({ profile: profile() });

    expect(existsSync(join(dir, centreDbFileName(result.centreId)))).toBe(true);
    expect(existsSync(join(dir, `${centreDbFileName(result.centreId)}.provisioning`))).toBe(false);
  });

  it('discard() removes a provisioned center so a failed switch leaves no orphan', async () => {
    const provisioner = makeProvisioner(dir);
    const result = await provisioner.provision({ profile: profile() });
    const dbFile = join(dir, centreDbFileName(result.centreId));
    // The SOU-302 escrow sibling may already sit next to the center; discard must
    // sweep it too so a failed switch leaves no stale sealed-key blob.
    const recoverySibling = `${dbFile.slice(0, -'.db'.length)}.recovery`;
    writeFileSync(recoverySibling, Buffer.from('sealed-blob'));
    expect(existsSync(dbFile)).toBe(true);

    await provisioner.discard(result.centreId);
    expect(existsSync(dbFile)).toBe(false);
    expect(existsSync(recoverySibling)).toBe(false);
  });

  it('seeds the director as the new center owner with a remembered device session', async () => {
    const result = await makeProvisioner(dir).provision({ profile: profile() });

    const db: DB = openDatabase({ centreId: result.centreId, key: KEY, dir });
    try {
      // Owner account: same director id + credential, re-stamped for the new tenant.
      const owner = db
        .prepare("SELECT id, role, username, password_hash, center_code FROM users WHERE role = 'owner'")
        .get() as { id: string; role: string; username: string; password_hash: string; center_code: string };
      expect(owner.id).toBe(DIRECTOR);
      expect(owner.username).toBe('directrice');
      expect(owner.password_hash).toBe(OWNER.passwordHash);
      expect(owner.center_code).toBe(result.centerCode);

      // A live remembered device session for the director, so the switch lands in
      // the shell — not the login screen.
      const session = db
        .prepare('SELECT session_id, user_id FROM device_sessions WHERE id = 1')
        .get() as { session_id: string | null; user_id: string | null };
      expect(session.session_id).not.toBeNull();
      expect(session.user_id).toBe(DIRECTOR);
    } finally {
      db.close();
    }
  });

  it('refuses to provision (and creates nothing) when there is no signed-in director', async () => {
    const provisioner = new SqliteCenterProvisioning({
      dir,
      keyFor: () => KEY,
      migrations: loadMigrations(REAL_MIGRATIONS),
      clock: fixedClock(),
      ids: counterIds(),
      hasActiveLicense: () => false,
      seedPlan: 'premium',
      currentOwner: async () => null,
    });

    await expect(provisioner.provision({ profile: profile() })).rejects.toBeInstanceOf(
      CenterProvisioningError,
    );
    expect(existsSync(join(dir, centreDbFileName('00000000000000000000000001')))).toBe(false);
  });

  it('starts a local trial only when unlicensed', async () => {
    const unlicensed = await makeProvisioner(dir, { hasActiveLicense: false, idsSeed: 1 }).provision({
      profile: profile(),
    });
    const licensed = await makeProvisioner(dir, { hasActiveLicense: true, idsSeed: 500 }).provision({
      profile: profile(),
    });

    const readTrial = (centreId: string): number => {
      const db: DB = openDatabase({ centreId, key: KEY, dir });
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM center_trial').get() as { n: number }).n;
      } finally {
        db.close();
      }
    };

    expect(readTrial(unlicensed.centreId)).toBe(1);
    expect(readTrial(licensed.centreId)).toBe(0);
  });

  it('allocates a distinct centreId per call so two centers never collide', async () => {
    // One provisioner, two calls: its id generator advances between provisions,
    // exactly like the real ULID generator hands out a fresh id each time.
    const provisioner = makeProvisioner(dir);
    const first = await provisioner.provision({ profile: profile() });
    const second = await provisioner.provision({ profile: profile({ name: 'Autre' }) });

    expect(first.centreId).not.toBe(second.centreId);
    expect(first.centerCode).not.toBe(second.centerCode);
  });

  it('leaves no partial DB behind when seeding fails (bad migrations)', async () => {
    const broken = new SqliteCenterProvisioning({
      dir,
      keyFor: () => KEY,
      migrations: [{ version: 1, name: '0001_broken.sql', sql: 'THIS IS NOT SQL;' }],
      clock: fixedClock(),
      ids: counterIds(),
      hasActiveLicense: () => false,
      seedPlan: 'premium',
      currentOwner: async () => OWNER,
    });

    await expect(broken.provision({ profile: profile() })).rejects.toBeInstanceOf(
      CenterProvisioningError,
    );
    // The bare ULID of the first generated id — neither the final name nor the
    // temp working file may survive a failed provision.
    const failedFile = centreDbFileName('00000000000000000000000001');
    expect(existsSync(join(dir, failedFile))).toBe(false);
    expect(existsSync(join(dir, `${failedFile}.provisioning`))).toBe(false);
  });
});
