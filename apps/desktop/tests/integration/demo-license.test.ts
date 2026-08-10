import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode } from '@centresoutien/domain';
import { Ed25519LicenseAdapter } from '../../src/data/license/ed25519-license-adapter';
import { licenseFileNameForCenter } from '../../src/data/license/license-file-path';
import { buildContainer } from '../../src/main/composition-root';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import {
  DEMO_CENTER_CODE,
  DEMO_LICENSE_FILE,
  DEMO_LICENSE_PUBLIC_KEY_PEM,
} from '../../src/data/demo/demo-license';
import { VENDOR_LICENSE_PUBLIC_KEY_PEM } from '../../src/data/license/vendor-public-key';
import { demoClock } from '../../src/main/demo/demo-center';

const KEY = 'demo-test-key';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-demo-lic-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('demo license (SOU-110)', () => {
  it('the committed fixture verifies against the committed demo public key with the demo claim', () => {
    const licensePath = join(dir, licenseFileNameForCenter(DEMO_CENTER_CODE));
    writeFileSync(licensePath, DEMO_LICENSE_FILE);
    const adapter = new Ed25519LicenseAdapter({
      filePath: licensePath,
      publicKey: DEMO_LICENSE_PUBLIC_KEY_PEM,
    });
    const verification = adapter.verify();
    expect(verification.status).toBe('valid');
    if (verification.status === 'valid') {
      expect(verification.claims.demo).toBe(true);
      expect(verification.claims.centerCode).toBe(DEMO_CENTER_CODE);
      expect(verification.claims.plan).toBe('premium');
      expect(verification.claims.expiresAt).toBeNull();
    }
  });

  it('a real center NEVER trusts the demo public key — the demo license fails closed', () => {
    // A real center opens with the production vendor key, so the demo-signed
    // license must NOT verify there (invalid-signature → restricted). This is the
    // "never weakens real-center verification" guarantee.
    const licensePath = join(dir, licenseFileNameForCenter('CS-CASA-001' as CenterCode));
    writeFileSync(licensePath, DEMO_LICENSE_FILE);
    const adapter = new Ed25519LicenseAdapter({
      filePath: licensePath,
      // The real center's trust anchor is the VENDOR key, never the demo key.
      publicKey: VENDOR_LICENSE_PUBLIC_KEY_PEM,
    });
    expect(adapter.verify().status).toBe('invalid-signature');
  });

  it('the demo container resolves premium, ACTIVE, and unrestricted from its own license', async () => {
    const licensePath = join(dir, licenseFileNameForCenter(DEMO_CENTER_CODE));
    writeFileSync(licensePath, DEMO_LICENSE_FILE);
    const container = buildContainer({
      centreId: 'demo',
      centerCode: DEMO_CENTER_CODE,
      key: KEY,
      dir,
      tempDir: dir,
      planId: 'essentiel',
      appVersion: () => '2.0.0',
      scheduleRestart: () => {},
      clock: demoClock,
    });
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps), {
      isRestricted: container.isRestricted,
    });

    expect((await dispatch('plan.get', {})).planId).toBe('premium');
    expect((await dispatch('license.status', {})).status).toBe('active');
    expect(container.isRestricted()).toBe(false);
    // The business channels are NOT blocked — demo mode is a working center.
    expect(await dispatch('subject.list', { scope: 'all' })).toEqual({ subjects: [] });

    container.dispose();
  });

  it('the demo license never activates on a REAL center (wrong-center, not restricted-open)', async () => {
    const licensePath = join(dir, licenseFileNameForCenter('CS-CASA-001' as CenterCode));
    writeFileSync(licensePath, DEMO_LICENSE_FILE);
    const container = buildContainer({
      centreId: 'C1',
      centerCode: 'CS-CASA-001' as CenterCode,
      key: KEY,
      dir,
      tempDir: dir,
      planId: 'essentiel',
      appVersion: () => '2.0.0',
      scheduleRestart: () => {},
      // Inject a real license adapter (the vendor-key trust anchor) so the dev
      // override doesn't suppress restricted mode — mirrors the restricted-mode
      // suite's build pattern in composition-root.test.ts.
      license: new Ed25519LicenseAdapter({
        filePath: licensePath,
        publicKey: VENDOR_LICENSE_PUBLIC_KEY_PEM,
      }),
    });
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps), {
      isRestricted: container.isRestricted,
    });
    // The demo license is signed with the demo key, which a real center does NOT
    // trust (it uses the vendor key) → invalid-signature → restricted. Never a
    // premium grant — the demo license cannot leak onto a real center.
    expect((await dispatch('license.status', {})).status).toBe('invalid-signature');
    expect(container.isRestricted()).toBe(true);
    container.dispose();
  });
});
