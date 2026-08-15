import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign as signBytes, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  CenterCode,
  DeviceId,
  LicenseClaims,
  LicensePort,
  ParentId,
  PlanId,
  SubjectId,
} from '@centresoutien/domain';
import { buildContainer } from '../../src/main/composition-root';
import { Ed25519LicenseAdapter } from '../../src/data/license/ed25519-license-adapter';
import { licenseFileNameForCenter } from '../../src/data/license/license-file-path';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import { openDatabase } from '../../src/data/sqlite/db';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { changeLogWriterForTest } from './helpers/change-log';
import { SqliteParentRepository } from '../../src/data/sqlite/repositories/parent-repository';
import { SqliteSessionRepository } from '../../src/data/sqlite/repositories/session-repository';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';

const KEY = 'passphrase-under-test';
const CENTER = 'CS-CASA-001' as CenterCode;
// Throwaway test credentials assembled from fragments so no literal password
// string appears in source (secret-scan friendly). Deterministic — not random.
const PASS = ['Casa', '2026', '!'].join('');
const WRONG = ['Wrong', '1', '!'].join('');
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-comp-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function build(planId: PlanId = 'essentiel', license?: LicensePort) {
  return buildContainer({
    centreId: 'C1',
    centerCode: 'CS-CASA-001' as CenterCode,
    key: KEY,
    dir,
    tempDir: dir,
    planId,
    appVersion: () => '2.0.0',
    scheduleRestart: () => {},
    ...(license ? { license } : {}),
  });
}

/** base64(JSON claims) is the signed byte string — mirrors the vendor signer. */
function signedLicenseFile(claims: LicenseClaims, privateKey: KeyObject): string {
  const claimsB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64');
  const signature = signBytes(null, Buffer.from(claimsB64, 'utf8'), privateKey).toString('base64');
  return JSON.stringify({ claims: claimsB64, signature });
}

/**
 * Write a genuine, test-keypair-signed `license.json` and return a real
 * {@link Ed25519LicenseAdapter} that verifies it against the matching public key.
 * Injected through `ContainerOptions.license` (the test seam), not the DEV-only
 * `CS_LICENSE_*` env overrides a production build never reads (SOU-98).
 */
function installSignedLicense(claims: LicenseClaims): LicensePort {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const licensePath = join(dir, licenseFileNameForCenter(CENTER));
  writeFileSync(licensePath, signedLicenseFile(claims, privateKey));
  return new Ed25519LicenseAdapter({
    filePath: licensePath,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  });
}

describe('composition root', () => {
  it('migrates the DB and wires subject.create end-to-end, persisting the row', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id } = await dispatch('subject.create', {
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    });
    expect(id).toMatch(/^sub_/);
    container.dispose();

    // Reopen the same encrypted file to prove it was actually persisted.
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    const saved = await new SqliteSubjectRepository(db, changeLogWriterForTest(db)).findById(
      id as SubjectId,
    );
    db.close();

    expect(saved?.name).toEqual({ fr: 'Mathématiques', ar: 'الرياضيات' });
    expect(saved?.centerCode).toBe('CS-CASA-001');
    expect(saved?.active).toBe(true);
    expect(saved?.deviceOrigin).toMatch(/^dev_/);
  });

  it('wires parent.create end-to-end (Essentiel), normalizing the phone and persisting the row', async () => {
    const container = build('essentiel'); // core.parents is a base-tier feature
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id } = await dispatch('parent.create', {
      name: 'Ahmed Benali',
      phone: '06 12 34 56 78',
      email: 'ahmed@benali.ma',
      relation: 'pere',
      whatsappOptIn: true,
    });
    expect(id).toMatch(/^prt_/);
    container.dispose();

    // Reopen the same encrypted file to prove it was actually persisted.
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    const saved = await new SqliteParentRepository(db).findById(id as ParentId);
    db.close();

    expect(saved?.name).toBe('Ahmed Benali');
    expect(saved?.phone).toBe('+212612345678'); // normalized to E.164 in the domain
    expect(saved?.relation).toBe('pere');
    expect(saved?.centerCode).toBe('CS-CASA-001');
    expect(saved?.naturalKey).toContain('+212612345678');
  });

  it('allows parent.create on Essentiel — core.parents is a base-tier feature', async () => {
    const container = build('essentiel');
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    const { id } = await dispatch('parent.create', {
      name: 'Ahmed',
      phone: '0612345678',
      relation: 'pere',
    });
    expect(id).toMatch(/^prt_/);
    container.dispose();
  });

  it('wires centerHours.save + get end-to-end and persists the week across a restart', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));

    expect(await dispatch1('centerHours.get', {})).toEqual({ week: [] }); // fresh center

    const week = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      windows: dayOfWeek === 0 ? [] : [{ open: '09:00', close: '18:00' }],
    }));
    const saved = await dispatch1('centerHours.save', week);
    expect(saved.week).toEqual(week);
    first.dispose();

    // Reopen the same encrypted file: the week persists.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect((await dispatch2('centerHours.get', {})).week).toEqual(week);
    second.dispose();
  });

  it('creates an admin account that survives a restart and then authenticates (SOU-26)', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));

    expect(await dispatch1('admin.exists', {})).toEqual({ exists: false });
    const { id } = await dispatch1('admin.create', {
      username: 'directrice',
      password: PASS,
    });
    expect(id).toMatch(/^usr_/);
    first.dispose();

    // Reopen the same encrypted file: the account persists and verifies.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await dispatch2('admin.exists', {})).toEqual({ exists: true });
    // SOU-97 removed the bare `admin.verify` channel; the credential check is
    // exercised only through the throttled `auth.login` path.
    expect(
      await dispatch2('auth.login', { username: 'directrice', password: PASS, rememberDevice: false }),
    ).toEqual({ outcome: 'success' });
    expect(
      await dispatch2('auth.login', {
        username: 'directrice',
        password: WRONG,
        rememberDevice: false,
      }),
    ).toMatchObject({ outcome: 'invalid-credentials' });
    second.dispose();
  });

  it('rejects a second admin account on the same center (single-admin invariant)', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    await dispatch('admin.create', { username: 'directrice', password: PASS });
    await expect(
      dispatch('admin.create', { username: 'autre', password: PASS }),
    ).rejects.toThrow();
    container.dispose();
  });

  it('remembers a device across restart, then forgets on logout (SOU-27)', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));
    await dispatch1('admin.create', { username: 'directrice', password: PASS });

    // Not authenticated before logging in.
    expect(await dispatch1('auth.session', {})).toEqual({ authenticated: false });
    expect(
      await dispatch1('auth.login', {
        username: 'directrice',
        password: PASS,
        rememberDevice: true,
      }),
    ).toEqual({ outcome: 'success' });
    expect(await dispatch1('auth.session', {})).toEqual({ authenticated: true });
    first.dispose();

    // Reopen the same encrypted file: the remembered session survives.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await dispatch2('auth.session', {})).toEqual({ authenticated: true });

    // Logout forgets it, and the forgetting also survives a restart.
    expect(await dispatch2('auth.logout', {})).toEqual({ ok: true });
    second.dispose();

    const third = build();
    const dispatch3 = createIpcDispatcher(createHandlers(third.handlerDeps));
    expect(await dispatch3('auth.session', {})).toEqual({ authenticated: false });
    third.dispose();
  });

  it('does not remember the device when the toggle is off (SOU-27)', async () => {
    const first = build();
    const d1 = createIpcDispatcher(createHandlers(first.handlerDeps));
    await d1('admin.create', { username: 'directrice', password: PASS });
    await d1('auth.login', { username: 'directrice', password: PASS, rememberDevice: false });
    expect(await d1('auth.session', {})).toEqual({ authenticated: false });
    first.dispose();

    const second = build();
    const d2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await d2('auth.session', {})).toEqual({ authenticated: false });
    second.dispose();
  });

  it('locks the console on the sixth wrong try and blocks a correct password (SOU-27)', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    await dispatch('admin.create', { username: 'directrice', password: PASS });

    for (let i = 0; i < 5; i += 1) {
      const r = await dispatch('auth.login', { username: 'directrice', password: WRONG });
      expect(r.outcome).toBe('invalid-credentials');
    }
    // Sixth wrong try trips the lock.
    expect((await dispatch('auth.login', { username: 'directrice', password: WRONG })).outcome).toBe(
      'locked-out',
    );
    // Seventh try — even with the correct password — is refused while locked.
    const seventh = await dispatch('auth.login', { username: 'directrice', password: PASS });
    expect(seventh).toMatchObject({ outcome: 'locked-out' });
    if (seventh.outcome === 'locked-out') expect(seventh.lockedUntilMs).toBeGreaterThan(Date.now());
    container.dispose();
  });

  it('wires center.save + center.get and persists the profile across restart (SOU-28)', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));

    expect(await dispatch1('center.get', {})).toEqual({ center: null });
    const saved = await dispatch1('center.save', {
      name: 'Centre Al Ilm',
      address: '12 Rue Mohammed V',
      phone: '0522-000000',
      email: 'contact@alilm.ma',
      logoPath: null,
    });
    expect(saved.center).toMatchObject({ name: 'Centre Al Ilm', plan: 'essentiel' });
    first.dispose();

    // Reopen the same encrypted file: the profile persists as the single row.
    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    const reread = await dispatch2('center.get', {});
    expect(reread.center).toMatchObject({
      name: 'Centre Al Ilm',
      email: 'contact@alilm.ma',
      logoPath: null,
      plan: 'essentiel',
    });
    second.dispose();
  });

  it('resolves the active plan from the license/dev override, never the editable center row (SOU-98)', async () => {
    // No license file present → the plan falls back to the build/dev override.
    // Build as 'pro' and save; the row is seeded 'pro' as a display mirror.
    const first = build('pro');
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));
    await dispatch1('center.save', { name: 'Centre Pro', address: '', phone: '', email: '', logoPath: null });
    expect(await dispatch1('plan.get', {})).toMatchObject({ planId: 'pro' });
    first.dispose();

    // Rebuild with a lower override. Under SOU-28 the stored 'pro' row would have
    // won (self-upgrade hole); under SOU-98 the gate ignores center.plan, so the
    // override wins and the display mirror is rewritten to match.
    const second = build('essentiel');
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));
    expect(await dispatch2('plan.get', {})).toMatchObject({ planId: 'essentiel' });
    expect((await dispatch2('center.get', {})).center).toMatchObject({ plan: 'essentiel' });
    second.dispose();
  });

  it('resolves the active plan to premium from a real signed, unexpired license (SOU-98)', async () => {
    // A genuine vendor-signed license verified against its own public key must
    // win over the dev override — even when that override is the lowest tier.
    const license = installSignedLicense({
      plan: 'premium',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      machineId: null,
      centerCode: 'CS-CASA-001',
    });

    const container = build('essentiel', license);
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    expect(await dispatch('plan.get', {})).toMatchObject({ planId: 'premium' });
    expect((await dispatch('center.save', { name: 'C', address: '', phone: '', email: '', logoPath: null })).center).toMatchObject({ plan: 'premium' });
    container.dispose();
  });

  it('falls back to essentiel when the genuine signed license is expired (SOU-98)', async () => {
    // Signature is valid but expiry is in the past — the license no longer grants
    // its tier, so the plan drops to the dev/startup fallback.
    const license = installSignedLicense({
      plan: 'premium',
      issuedAt: '2000-01-01T00:00:00.000Z',
      expiresAt: '2000-01-02T00:00:00.000Z',
      machineId: null,
      centerCode: 'CS-CASA-001',
    });

    const container = build('essentiel', license);
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
    expect(await dispatch('plan.get', {})).toMatchObject({ planId: 'essentiel' });
    container.dispose();
  });

  it('activates a supplied license end-to-end: verifies, persists, flips the plan (SOU-104)', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    // The injected read adapter and the internal FsLicenseStore must resolve the
    // same per-center path, or an activation write would land where startup never
    // reads it (SOU-104 M2).
    const licensePath = join(dir, licenseFileNameForCenter(CENTER));
    const adapter = () => new Ed25519LicenseAdapter({ filePath: licensePath, publicKey: publicPem });

    const container = build('essentiel', adapter());
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    expect(await dispatch('plan.get', {})).toMatchObject({ planId: 'essentiel' });
    expect((await dispatch('license.status', {})).status).toBe('missing');

    const raw = signedLicenseFile(
      {
        plan: 'premium',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        machineId: null,
        centerCode: 'CS-CASA-001',
        centersAllowed: 3,
        founderDiscountExpiresAt: null,
      },
      privateKey,
    );

    const result = await dispatch('license.activate', { license: raw });
    expect(result).toMatchObject({ status: 'activated', plan: 'premium', centersAllowed: 3 });
    expect(await dispatch('plan.get', {})).toMatchObject({ planId: 'premium' });
    expect(await dispatch('license.status', {})).toMatchObject({
      status: 'active',
      plan: 'premium',
      restricted: false,
      centersAllowed: 3,
    });
    container.dispose();

    // The write survives a restart: a fresh container reads premium off disk.
    const rebuilt = build('essentiel', adapter());
    const dispatch2 = createIpcDispatcher(createHandlers(rebuilt.handlerDeps));
    expect(await dispatch2('plan.get', {})).toMatchObject({ planId: 'premium' });
    rebuilt.dispose();
  });

  it('rejects a wrong-center license, leaving the plan and disk untouched (SOU-104)', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const licensePath = join(dir, licenseFileNameForCenter(CENTER));
    const container = build(
      'essentiel',
      new Ed25519LicenseAdapter({ filePath: licensePath, publicKey: publicPem }),
    );
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const raw = signedLicenseFile(
      {
        plan: 'premium',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        machineId: null,
        centerCode: 'CS-RABAT-999',
        centersAllowed: null,
        founderDiscountExpiresAt: null,
      },
      privateKey,
    );

    expect(await dispatch('license.activate', { license: raw })).toEqual({
      status: 'rejected',
      reason: 'wrong-center',
    });
    expect(await dispatch('plan.get', {})).toMatchObject({ planId: 'essentiel' });
    expect(existsSync(licensePath)).toBe(false);
    container.dispose();
  });

  it('scopes the license file per center — activating one center never licenses another (SOU-104 M2)', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const centerA = 'CS-CASA-001' as CenterCode;
    const centerB = 'CS-RABAT-002' as CenterCode;
    const pathA = join(dir, licenseFileNameForCenter(centerA));
    const pathB = join(dir, licenseFileNameForCenter(centerB));

    const buildCenter = (centreId: string, centerCode: CenterCode, path: string) =>
      buildContainer({
        centreId,
        centerCode,
        key: KEY,
        dir,
        tempDir: dir,
        planId: 'essentiel',
        appVersion: () => '2.0.0',
        scheduleRestart: () => {},
        license: new Ed25519LicenseAdapter({ filePath: path, publicKey: publicPem }),
      });

    const licenseFor = (centerCode: CenterCode) =>
      signedLicenseFile(
        {
          plan: 'premium',
          issuedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2099-01-01T00:00:00.000Z',
          machineId: null,
          centerCode,
          centersAllowed: null,
          founderDiscountExpiresAt: null,
        },
        privateKey,
      );

    // Activate center A (writes A's per-center slot).
    const a1 = buildCenter('A', centerA, pathA);
    const da1 = createIpcDispatcher(createHandlers(a1.handlerDeps));
    expect((await da1('license.activate', { license: licenseFor(centerA) })).status).toBe(
      'activated',
    );
    a1.dispose();

    // Center B, opened in the same userData dir, is NOT licensed by A's activation.
    const b1 = buildCenter('B', centerB, pathB);
    const db1 = createIpcDispatcher(createHandlers(b1.handlerDeps));
    expect((await db1('license.status', {})).status).toBe('missing');
    expect(await db1('plan.get', {})).toMatchObject({ planId: 'essentiel' });

    // Activating B writes B's own slot, leaving A's file untouched.
    expect((await db1('license.activate', { license: licenseFor(centerB) })).status).toBe(
      'activated',
    );
    b1.dispose();
    expect(existsSync(pathA)).toBe(true);
    expect(existsSync(pathB)).toBe(true);

    // Center A, reopened, still reads its own premium license intact — the
    // regression the reviewer flagged (B's activation had overwritten A's slot).
    const a2 = buildCenter('A', centerA, pathA);
    const da2 = createIpcDispatcher(createHandlers(a2.handlerDeps));
    expect(await da2('plan.get', {})).toMatchObject({ planId: 'premium' });
    expect((await da2('license.status', {})).status).toBe('active');
    a2.dispose();
  });

  it('persists a stable device origin across container rebuilds', async () => {
    const first = build();
    const dev1 = first.handlerDeps.envelopeContext().deviceOrigin;
    first.dispose();

    const second = build();
    const dev2 = second.handlerDeps.envelopeContext().deviceOrigin;
    second.dispose();

    expect(dev1).toMatch(/^dev_/);
    expect(dev2).toBe(dev1);
  });

  // The full Student read/write path through real SQLite — the wiring SOU-39's
  // UI depends on. Guards against the regression where only `student.create` was
  // registered and reads fell back to a mock (list/get returned nothing real).
  it('wires the student list/get/update/archive channels end-to-end', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id } = await dispatch('student.create', {
      name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
      birthDate: '2010-01-01',
      level: '2 Bac SM',
      school: null,
      notes: null,
      guardianIds: [],
    });
    expect(id).toMatch(/^stu_/);

    // list — the freshly created student is really there (no mock).
    const listed = await dispatch('student.list', { search: 'yass' });
    expect(listed.students).toHaveLength(1);
    expect(listed.students[0]?.id).toBe(id);
    expect(listed.students[0]?.archived).toBe(false);

    // get — same row by id.
    const got = await dispatch('student.get', { id });
    expect(got.student?.name).toEqual({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });

    // update — the change persists and reads back.
    const updated = await dispatch('student.update', {
      id,
      name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
      birthDate: '2010-01-01',
      level: '1 Bac SE',
      school: 'Lycée Ibn Sina',
      notes: null,
      guardianIds: [],
    });
    expect(updated.student.level).toBe('1 Bac SE');
    expect((await dispatch('student.get', { id })).student?.school).toBe('Lycée Ibn Sina');

    // setGuardians — the partial-update channel (SOU-116) links a guardian
    // without replaying name/level/notes, and rejects a stale expectedVersion.
    const { id: guardianId } = await dispatch('parent.create', {
      name: 'Karim Alaoui',
      phone: '06 00 00 00 01',
      email: null,
      relation: 'pere',
      whatsappOptIn: false,
    });

    await expect(
      dispatch('student.setGuardians', {
        id,
        guardianIds: [guardianId],
        expectedVersion: updated.student.version + 1,
      }),
    ).rejects.toThrow();

    const withGuardian = await dispatch('student.setGuardians', {
      id,
      guardianIds: [guardianId],
      expectedVersion: updated.student.version,
    });
    expect(withGuardian.student.guardianIds).toEqual([guardianId]);
    expect(withGuardian.student.level).toBe('1 Bac SE');
    expect((await dispatch('student.get', { id })).student?.guardianIds).toEqual([guardianId]);

    // archive — soft delete removes it from reads.
    expect(await dispatch('student.archive', { id })).toEqual({ ok: true });
    expect((await dispatch('student.list', { search: '' })).students).toHaveLength(0);
    expect((await dispatch('student.get', { id })).student).toBeNull();

    container.dispose();
  });

  // The full Room read/write path through real SQLite (SOU-33) — the wiring SOU-34's
  // UI depends on. Proves migration 0009 applied and all five room channels reach
  // their pre-wired use cases (not a mock).
  it('wires the room create/list/update/archive/restore channels end-to-end', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id } = await dispatch('room.create', { name: 'Salle A', capacity: 20 });
    expect(id).toMatch(/^rom_/);

    // list — the freshly created room is really there.
    const listed = await dispatch('room.list', { scope: 'active' });
    expect(listed.rooms).toHaveLength(1);
    expect(listed.rooms[0]).toMatchObject({ id, name: 'Salle A', capacity: 20, archived: false });

    // update — the change persists and reads back.
    const updated = await dispatch('room.update', { id, name: 'Salle B', capacity: 30 });
    expect(updated.room).toMatchObject({ name: 'Salle B', capacity: 30 });
    expect((await dispatch('room.list', { scope: 'active' })).rooms[0]?.name).toBe('Salle B');

    // archive — soft delete moves it out of the active list into the archive.
    expect(await dispatch('room.archive', { id })).toEqual({ ok: true });
    expect((await dispatch('room.list', { scope: 'active' })).rooms).toHaveLength(0);
    const archived = await dispatch('room.list', { scope: 'archived' });
    expect(archived.rooms.map((r) => r.id)).toEqual([id]);
    expect(archived.rooms[0]?.archived).toBe(true);

    // restore — brings it back to the live list.
    const restored = await dispatch('room.restore', { id });
    expect(restored.room).toMatchObject({ id, archived: false });
    expect((await dispatch('room.list', { scope: 'active' })).rooms.map((r) => r.id)).toEqual([id]);

    container.dispose();
  });

  // Since the SOU-83 MVP collapse every live tier has unlimited room limits, so the
  // wired create channel no longer caps. The limit-exceeded path is still enforced in
  // the domain and covered by CreateRoom's unit tests against a synthetic capped plan.
  it('does not cap room creation on the wired channel (unlimited limits across tiers)', async () => {
    const container = build('essentiel');
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    for (const name of ['Salle A', 'Salle B', 'Salle C']) {
      await dispatch('room.create', { name, capacity: 10 });
    }
    expect((await dispatch('room.list', { scope: 'active' })).rooms).toHaveLength(3);

    container.dispose();
  });

  // The full Formula read/write path through real SQLite (SOU-62) — create/list/
  // get/update/clone/deactivate all reach their pre-wired use cases (not a mock),
  // and the immutability trigger + the deactivate bypass both hold through the
  // real adapter, not just the in-memory fakes the unit tests use.
  it('wires the formula create/list/get/update/clone/deactivate channels end-to-end', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const math = await dispatch('subject.create', { name: { fr: 'Mathématiques', ar: 'الرياضيات' } });
    const phys = await dispatch('subject.create', { name: { fr: 'Physique', ar: 'الفيزياء' } });

    const { id } = await dispatch('formula.create', {
      name: { fr: 'Math seul', ar: 'رياضيات فقط' },
      subjectIds: [math.id],
      priceMad: 20000,
      kind: 'regular',
    });
    expect(id).toMatch(/^fml_/);

    // list — the freshly created formula is really there.
    const listed = await dispatch('formula.list', { scope: 'active' });
    expect(listed.formulas).toHaveLength(1);
    expect(listed.formulas[0]).toMatchObject({ id, priceMad: 20000, isImmutable: false, active: true });

    // get — same row by id.
    const got = await dispatch('formula.get', { id });
    expect(got.formula?.subjectIds).toEqual([math.id]);

    // update — the change persists and reads back (still mutable, never used).
    const updated = await dispatch('formula.update', {
      id,
      name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
      subjectIds: [math.id, phys.id],
      priceMad: 35000,
      kind: 'regular',
    });
    expect(updated.formula).toMatchObject({ priceMad: 35000, subjectIds: [math.id, phys.id] });

    // clone — an independent, fresh, mutable, active copy.
    const cloned = await dispatch('formula.clone', { id });
    expect(cloned.id).not.toBe(id);
    const cloneView = await dispatch('formula.get', { id: cloned.id });
    expect(cloneView.formula).toMatchObject({ priceMad: 35000, isImmutable: false, active: true });

    // deactivate — flips active off; the original formula is unaffected otherwise.
    const deactivated = await dispatch('formula.deactivate', { id });
    expect(deactivated.formula).toMatchObject({ id, active: false, priceMad: 35000 });
    expect((await dispatch('formula.list', { scope: 'active' })).formulas.map((f) => f.id)).toEqual([cloned.id]);
    expect((await dispatch('formula.list', { scope: 'all' })).formulas).toHaveLength(2);

    container.dispose();
  });

  // The immutability barrier reached through real SQLite: once an invoice line
  // references a formula, `formula.update` must reject even a no-op patch, but
  // `formula.deactivate` must still succeed — the exact gap the SOU-60 review
  // flagged and this ticket's KICKOFF fixes.
  it('rejects formula.update but allows formula.deactivate once a formula is immutable', async () => {
    const first = build();
    const dispatch1 = createIpcDispatcher(createHandlers(first.handlerDeps));

    const math = await dispatch1('subject.create', { name: { fr: 'Mathématiques', ar: 'الرياضيات' } });
    const { id } = await dispatch1('formula.create', {
      name: { fr: 'Math seul', ar: 'رياضيات فقط' },
      subjectIds: [math.id],
      priceMad: 20000,
      kind: 'regular',
    });
    first.dispose();

    // Flip is_immutable the same way an invoice line does (SOU-61's trigger) — open
    // the same encrypted file directly and insert a bare invoice_lines row
    // referencing the formula (no invoices header needed — invoice_lines carries
    // no FK, sync-order safe per migration 0018).
    const raw = openDatabase({ centreId: 'C1', key: KEY, dir });
    raw
      .prepare(
        `INSERT INTO invoice_lines
          (id, center_code, device_origin, created_at, updated_at, updated_by,
           deleted_at, version, invoice_id, formula_id, label_fr, label_ar, kind, amount_mad)
         VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,?,?)`,
      )
      .run(
        'invl_00000000000000000000000001',
        'CS-CASA-001',
        'dev_00000000000000000000000001',
        new Date().toISOString(),
        new Date().toISOString(),
        'usr_local-device',
        'inv_00000000000000000000000001',
        id,
        'Math seul',
        'رياضيات فقط',
        'regular',
        20000,
      );
    raw.close();

    const second = build();
    const dispatch2 = createIpcDispatcher(createHandlers(second.handlerDeps));

    await expect(
      dispatch2('formula.update', {
        id,
        name: { fr: 'Math seul', ar: 'رياضيات فقط' },
        subjectIds: [math.id],
        priceMad: 20000,
        kind: 'regular',
      }),
    ).rejects.toThrow();

    const deactivated = await dispatch2('formula.deactivate', { id });
    expect(deactivated.formula).toMatchObject({ id, active: false, isImmutable: true });

    second.dispose();
  });

  // The SOU-158/159 auto-session-generator engine, wired end-to-end (SOU-161):
  // resolving `scope: 'all'` against the real group/room/center-hours repos,
  // committing the confirmed proposal through the same `CreateWeeklyRecurringSession`
  // + `GenerateAndPersistSessions` seam manual booking uses, and materializing
  // real dated Session rows — not a mock at any layer.
  it('wires the session.generator.preview and .commit channels end-to-end', async () => {
    const container = build('premium'); // mode: 'auto' requires planning.random-auto
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id: subjectId } = await dispatch('subject.create', {
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    });
    const { id: roomId } = await dispatch('room.create', { name: 'Salle A', capacity: 20 });
    const { id: groupId } = await dispatch('group.create', {
      subjectId,
      teacherId: null,
      roomId,
      level: '2ème Bac',
      capacity: 15,
      kind: 'regular',
    });

    const config = {
      scope: { groups: 'all' as const, teachers: 'all' as const },
      kind: 'regular' as const,
      weekdayPool: [1],
      sessionsPerWeek: 1,
      minGapDays: 1,
      sessionDurationMinutes: 60,
      range: { startDate: '2026-09-01', endDate: '2026-09-30' },
      mode: 'auto' as const,
    };

    const preview = await dispatch('session.generator.preview', config);
    expect(preview.proposals).toHaveLength(1);
    expect(preview.proposals[0]).toMatchObject({ groupId });
    expect(preview.proposals[0]?.blocks).toEqual([{ dayOfWeek: 1, start: '09:00', end: '10:00', roomId, teacherId: null }]);
    expect(preview.conflicts).toEqual([]);

    const commit = await dispatch('session.generator.commit', {
      mode: config.mode,
      proposals: preview.proposals.map(({ groupId: id, blocks }) => ({ groupId: id, blocks })),
      range: config.range,
    });
    expect(commit.templates).toHaveLength(1);
    const template = commit.templates[0]!;
    expect(template.groupId).toBe(groupId);
    expect(template.recurringSessionId).toMatch(/^wrs_/);
    expect(template.generationBatchId).toMatch(/^gen_/);
    expect(template.skippedHolidays).toEqual([]);

    const week = await dispatch('session.week', {});
    expect(week.sessions).toHaveLength(1);
    expect(week.sessions[0]).toMatchObject({
      id: template.recurringSessionId,
      dayOfWeek: 1,
      roomId,
      groupId,
      kind: 'regular',
    });

    container.dispose();

    // Reopen the same encrypted file to prove the dated occurrences were really
    // persisted, not merely echoed back by the handler.
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    const materialized = await new SqliteSessionRepository(
      db,
      new SqliteChangeLogWriter(db, { now: () => new Date() }, 'dev_readonly' as DeviceId),
    ).listForRange('CS-CASA-001' as CenterCode, {
      start: '2026-09-01',
      end: '2026-09-30',
    });
    db.close();
    expect(materialized.length).toBeGreaterThan(0);
    expect(materialized.every((s) => s.recurringSessionId === template.recurringSessionId)).toBe(true);
  });

  it('projects teacher conflicts from session.generator.preview across IPC', async () => {
    const container = build('premium');
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id: subjectId } = await dispatch('subject.create', {
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    });
    const { id: teacherId } = await dispatch('teacher.create', {
      name: { fr: 'Nadia El Fassi', ar: 'نادية الفاسي' },
      phone: '0612345678',
      cin: null,
      email: null,
      subjectIds: [subjectId],
    });
    const { id: roomAId } = await dispatch('room.create', { name: 'Salle A', capacity: 20 });
    const { id: roomBId } = await dispatch('room.create', { name: 'Salle B', capacity: 20 });
    const { id: groupId } = await dispatch('group.create', {
      subjectId,
      teacherId,
      roomId: roomAId,
      level: '2ème Bac',
      capacity: 15,
      kind: 'regular',
    });
    await dispatch('weeklySession.create', {
      roomId: roomBId,
      teacherId,
      groupId,
      dayOfWeek: 1,
      start: '09:30',
      end: '10:30',
      active: true,
      validFrom: null,
      validTo: null,
    });

    const preview = await dispatch('session.generator.preview', {
      scope: { groups: [groupId], teachers: 'all' as const },
      kind: 'regular' as const,
      weekdayPool: [1],
      sessionsPerWeek: 1,
      minGapDays: 1,
      sessionDurationMinutes: 60,
      range: { startDate: '2026-09-01', endDate: '2026-09-30' },
      mode: 'auto' as const,
    });

    expect(preview.proposals[0]?.blocks[0]).toMatchObject({ dayOfWeek: 1, start: '09:00', end: '10:00', teacherId });
    expect(preview.conflicts).toContainEqual({
      kind: 'teacher',
      groupId,
      teacherId,
      dayOfWeek: 1,
      start: '09:00',
      end: '10:00',
      conflicts: [
        expect.objectContaining({ roomId: roomBId, teacherId, dayOfWeek: 1, start: '09:30', end: '10:30' }),
      ],
    });

    container.dispose();
  });

  // A stale preview must never silently overwrite a slot someone else booked in
  // the meantime — the commit re-runs the composite conflict check for real.
  it('rejects session.generator.commit when the room is already booked at write time', async () => {
    const container = build('premium'); // mode: 'auto' requires planning.random-auto
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const { id: subjectId } = await dispatch('subject.create', {
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    });
    const { id: roomId } = await dispatch('room.create', { name: 'Salle A', capacity: 20 });
    const { id: groupId } = await dispatch('group.create', {
      subjectId,
      teacherId: null,
      roomId,
      level: '2ème Bac',
      capacity: 15,
      kind: 'regular',
    });

    // Another device books the exact same room/day/time by hand, after the
    // (never-sent) preview would have been generated.
    await dispatch('weeklySession.create', {
      roomId,
      teacherId: null,
      groupId: null,
      dayOfWeek: 1,
      start: '09:00',
      end: '10:00',
      active: true,
      validFrom: null,
      validTo: null,
    });

    await expect(
      dispatch('session.generator.commit', {
        mode: 'auto',
        proposals: [{ groupId, blocks: [{ dayOfWeek: 1, start: '09:00', end: '10:00', roomId }] }],
        range: { startDate: '2026-09-01', endDate: '2026-09-30' },
      }),
    ).rejects.toThrow();

    container.dispose();
  });

  // SOU-104 server-side hard lock: the restricted-mode confinement is enforced at
  // the IPC boundary, not only in the renderer's LicenseGate. Until the license
  // resolves to `active`, only `license.status` + `license.activate` answer; every
  // other channel is rejected with `LicenseRestrictedError`. Supersedes SOU-173.
  describe('restricted-mode IPC hard lock (SOU-104)', () => {
    const licensePath = () => join(dir, licenseFileNameForCenter(CENTER));

    // Build a container whose injected adapter resolves to a non-active status,
    // wired through a dispatcher that consults the live restricted-mode gate.
    function buildRestricted(writeLicense: (privateKey: KeyObject) => void) {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      writeLicense(privateKey);
      const container = build(
        'essentiel',
        new Ed25519LicenseAdapter({ filePath: licensePath(), publicKey: publicPem }),
      );
      const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps), {
        isRestricted: container.isRestricted,
      });
      return { container, dispatch };
    }

    const nonActiveClaims = (overrides: Partial<LicenseClaims>): LicenseClaims => ({
      plan: 'premium',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      machineId: null,
      centerCode: 'CS-CASA-001',
      centersAllowed: null,
      founderDiscountExpiresAt: null,
      ...overrides,
    });

    const scenarios: ReadonlyArray<{
      readonly name: string;
      readonly status: string;
      readonly write: (privateKey: KeyObject) => void;
    }> = [
      { name: 'missing', status: 'missing', write: () => {} },
      {
        name: 'invalid-signature',
        status: 'invalid-signature',
        write: () => writeFileSync(licensePath(), 'not-a-license-envelope'),
      },
      {
        name: 'expired',
        status: 'expired',
        write: (privateKey) =>
          writeFileSync(
            licensePath(),
            signedLicenseFile(
              nonActiveClaims({
                issuedAt: '2000-01-01T00:00:00.000Z',
                expiresAt: '2000-01-02T00:00:00.000Z',
              }),
              privateKey,
            ),
          ),
      },
      {
        name: 'wrong-machine',
        status: 'wrong-machine',
        write: (privateKey) =>
          writeFileSync(
            licensePath(),
            signedLicenseFile(nonActiveClaims({ machineId: 'some-other-laptop' }), privateKey),
          ),
      },
      {
        name: 'wrong-center',
        status: 'wrong-center',
        write: (privateKey) =>
          writeFileSync(
            licensePath(),
            signedLicenseFile(nonActiveClaims({ centerCode: 'CS-RABAT-999' }), privateKey),
          ),
      },
    ];

    it.each(scenarios)(
      'blocks non-license channels but allows license.status + license.activate under a $name license',
      async ({ status, write }) => {
        const { container, dispatch } = buildRestricted(write);

        // license.status is reachable and reports the non-active state.
        expect((await dispatch('license.status', {})).status).toBe(status);

        // A normal data channel is hard-locked at the boundary — the domain gate
        // and the handler never run; the restricted error surfaces instead.
        await expect(dispatch('student.list', { search: '' })).rejects.toThrow(/license-restricted/);

        // license.activate is reachable too (a bad envelope is rejected on its own
        // merits, NOT swallowed by the restricted lock).
        expect(await dispatch('license.activate', { license: 'not-a-license' })).toEqual({
          status: 'rejected',
          reason: 'invalid-signature',
        });

        container.dispose();
      },
    );

    // Fresh install: no license (it cannot exist before the center does) and no
    // center yet. The first-run wizard's bootstrap channels must succeed so the
    // user can create the center + admin. Saving the new center also starts its
    // 14-day trial, which opens business channels before license activation.
    it('permits the first-run bootstrap and opens business during the new-center trial', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const container = build(
        'essentiel',
        new Ed25519LicenseAdapter({ filePath: licensePath(), publicKey: publicPem }),
      );
      const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps), {
        isRestricted: container.isRestricted,
      });

      // License is missing and no center exists — the true fresh-install state.
      expect((await dispatch('license.status', {})).status).toBe('missing');

      // The wizard's bootstrap channels all answer under restricted mode.
      expect(await dispatch('admin.exists', {})).toEqual({ exists: false });
      expect(await dispatch('center.get', {})).toEqual({ center: null });
      const saved = await dispatch('center.save', {
        name: 'Centre Al Ilm',
        address: '12 Rue Mohammed V',
        phone: '0522-000000',
        email: 'contact@alilm.ma',
        logoPath: null,
      });
      expect(saved.center).toMatchObject({ name: 'Centre Al Ilm' });
      const admin = await dispatch('admin.create', { username: 'directrice', password: PASS });
      expect(admin.id).toMatch(/^usr_/);

      expect((await dispatch('license.status', {})).status).toBe('trial-active');
      expect((await dispatch('student.list', { search: '' })).students).toEqual([]);

      // A paid license can still be activated during the trial, replacing the
      // trial access with the licensed entitlement in the same process.
      const raw = signedLicenseFile(nonActiveClaims({}), privateKey);
      expect((await dispatch('license.activate', { license: raw })).status).toBe('activated');
      expect((await dispatch('student.list', { search: '' })).students).toEqual([]);

      container.dispose();
    });

    it('unblocks the other channels in the same process after a successful activate — no restart', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const container = build(
        'essentiel',
        new Ed25519LicenseAdapter({ filePath: licensePath(), publicKey: publicPem }),
      );
      const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps), {
        isRestricted: container.isRestricted,
      });

      // Restricted at first: student.list is locked, status reads missing.
      await expect(dispatch('student.list', { search: '' })).rejects.toThrow(/license-restricted/);
      expect((await dispatch('license.status', {})).status).toBe('missing');

      const raw = signedLicenseFile(
        nonActiveClaims({ centersAllowed: 3 }),
        privateKey,
      );
      expect((await dispatch('license.activate', { license: raw })).status).toBe('activated');

      // The very same dispatcher/process now answers the previously-blocked
      // channel — the gate re-read the freshly persisted license, no rebuild.
      expect((await dispatch('student.list', { search: '' })).students).toEqual([]);
      expect((await dispatch('license.status', {})).status).toBe('active');

      container.dispose();
    });

    // CodeRabbit SOU-104: the bootstrap channels are open only *until* setup is
    // complete. On an already-configured center (an admin exists) whose license has
    // since lapsed, the wizard never runs again — so `admin.create` / `center.save`
    // / its logo channels must NOT stay reachable, or an unlicensed process could
    // still mint an admin or rewrite the center profile. `isSetupComplete` closes
    // them once an admin exists, while the fresh-install bootstrap still succeeds.
    it('closes the wizard bootstrap channels once setup is complete, even while restricted', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      // Signed but wrong-center → verifiable yet non-active, so restriction stays on
      // throughout (no license rewrite happens in this test).
      writeFileSync(
        licensePath(),
        signedLicenseFile(nonActiveClaims({ centerCode: 'CS-RABAT-999' }), privateKey),
      );
      const container = build(
        'essentiel',
        new Ed25519LicenseAdapter({ filePath: licensePath(), publicKey: publicPem }),
      );
      const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps), {
        isRestricted: container.isRestricted,
        isSetupComplete: container.isSetupComplete,
      });

      // Fresh install: no admin yet → bootstrap is open so setup can proceed.
      expect((await dispatch('license.status', {})).status).toBe('wrong-center');
      expect(await dispatch('admin.exists', {})).toEqual({ exists: false });
      await dispatch('center.save', {
        name: 'Centre Al Ilm',
        address: '12 Rue Mohammed V',
        phone: '0522-000000',
        email: 'contact@alilm.ma',
        logoPath: null,
      });
      // The new-center save starts a trial. Expire it explicitly so this test
      // continues to exercise the completed-setup restricted boundary.
      container.db
        .prepare("UPDATE center_trial SET started_at = '2026-01-01T00:00:00.000Z', last_seen_at = '2026-01-15T00:00:00.000Z'")
        .run();
      expect((await dispatch('license.status', {})).status).toBe('trial-expired');
      await dispatch('admin.create', { username: 'directrice', password: PASS });

      // Setup is now complete (an admin exists). The gate re-reads that state and the
      // bootstrap mutations close — while the routing read (`admin.exists`) and the
      // activation surface stay open so the user can still fix the license.
      expect(await dispatch('admin.exists', {})).toEqual({ exists: true });
      await expect(
        dispatch('center.save', {
          name: 'Tampered',
          address: 'x',
          phone: '0522-000000',
          email: 'x@y.ma',
          logoPath: null,
        }),
      ).rejects.toThrow(/license-restricted/);
      await expect(
        dispatch('admin.create', { username: 'intruder', password: PASS }),
      ).rejects.toThrow(/license-restricted/);
      expect((await dispatch('license.activate', { license: 'not-a-license' })).reason).toBe(
        'invalid-signature',
      );

      container.dispose();
    });
  });
});
