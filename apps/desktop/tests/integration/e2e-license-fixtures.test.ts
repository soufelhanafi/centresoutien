import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateKey, sign as signBytes, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode, LicenseClaims } from '@centresoutien/domain';
import { buildContainer } from '../../src/main/composition-root';
import { Ed25519LicenseAdapter } from '../../src/data/license/ed25519-license-adapter';
import { licenseFileNameForCenter } from '../../src/data/license/license-file-path';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';

/**
 * SOU-172 — the COMMITTED test keypair that the `--mode e2e` build trusts (via
 * `CS_LICENSE_PUBLIC_KEY`) must actually produce signature-valid licenses that
 * activate through the composition root. This test binds those fixtures to the
 * activation path at the unit/integration level, so fixture drift (or a stale
 * committed key) is caught here instead of only in the slower e2e run — and it
 * proves each claim shape the e2e scenarios rely on resolves to its intended
 * license status.
 */

const FIXTURE_DIR = join(__dirname, '../fixtures/license');
const TEST_PUBLIC_KEY_PEM = readFileSync(join(FIXTURE_DIR, 'test-public-key.pem'), 'utf8');
const testPrivateKey: KeyObject = createPrivateKey(
  readFileSync(join(FIXTURE_DIR, 'test-private-key.pem'), 'utf8'),
);

const KEY = 'passphrase-under-test';
const CENTER = 'CS-CASA-001' as CenterCode;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-e2e-lic-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function signWithTestKey(claims: LicenseClaims): string {
  const claimsB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64');
  const signature = signBytes(null, Buffer.from(claimsB64, 'utf8'), testPrivateKey).toString('base64');
  return JSON.stringify({ claims: claimsB64, signature });
}

const claims = (overrides: Partial<LicenseClaims> = {}): LicenseClaims => ({
  plan: 'premium',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  machineId: null,
  centerCode: null,
  centersAllowed: 3,
  founderDiscountExpiresAt: null,
  demo: false,
  ...overrides,
});

/** An adapter reading the per-center path, trusting the committed TEST public key —
 *  exactly what the `--mode e2e` build wires through `CS_LICENSE_PUBLIC_KEY`. */
function trustedAdapter() {
  return new Ed25519LicenseAdapter({
    filePath: join(dir, licenseFileNameForCenter(CENTER)),
    publicKey: TEST_PUBLIC_KEY_PEM,
  });
}

function build(license = trustedAdapter()) {
  return buildContainer({
    centreId: 'C1',
    centerCode: CENTER,
    key: KEY,
    dir,
    tempDir: dir,
    planId: 'essentiel',
    appVersion: () => '2.0.0',
    scheduleRestart: () => {},
    license,
  });
}

describe('committed e2e license fixtures (SOU-172)', () => {
  it('activates a committed-key-signed license end-to-end and flips the plan', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    expect((await dispatch('license.status', {})).status).toBe('missing');

    const result = await dispatch('license.activate', {
      license: signWithTestKey(claims({ plan: 'premium', centersAllowed: 3 })),
    });
    expect(result).toMatchObject({ status: 'activated', plan: 'premium', centersAllowed: 3 });
    expect(await dispatch('plan.get', {})).toEqual({ planId: 'premium' });
    expect(await dispatch('license.status', {})).toMatchObject({
      status: 'active',
      plan: 'premium',
      restricted: false,
      centersAllowed: 3,
    });
    container.dispose();
  });

  it('resolves each committed fixture shape to the license status the e2e scenarios expect', async () => {
    const licensePath = join(dir, licenseFileNameForCenter(CENTER));
    const cases: ReadonlyArray<{ readonly claims: LicenseClaims; readonly status: string }> = [
      { claims: claims(), status: 'active' }, // S7
      { claims: claims({ expiresAt: '2000-01-01T00:00:00.000Z' }), status: 'expired' }, // S8
      { claims: claims({ machineId: 'some-other-machine-id' }), status: 'wrong-machine' }, // S9
      { claims: claims({ centerCode: 'CS-OTHER-999' }), status: 'wrong-center' }, // S9
      {
        claims: claims({ founderDiscountExpiresAt: '2000-01-01T00:00:00.000Z' }),
        status: 'active',
      }, // S10 — lapsed founder discount never restricts
    ];

    for (const { claims: c, status } of cases) {
      writeFileSync(licensePath, signWithTestKey(c));
      const container = build();
      const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
      const view = await dispatch('license.status', {});
      expect(view.status).toBe(status);
      if (c.founderDiscountExpiresAt !== null) expect(view.founderDiscountExpired).toBe(true);
      container.dispose();
    }
  });
});
