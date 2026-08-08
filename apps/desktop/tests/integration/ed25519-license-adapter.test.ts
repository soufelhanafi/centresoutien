import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateKeyPairSync,
  sign as signBytes,
  type KeyObject,
} from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LicenseClaims } from '@centresoutien/domain';
import { Ed25519LicenseAdapter } from '../../src/data/license/ed25519-license-adapter';

const vendor = generateKeyPairSync('ed25519');
const attacker = generateKeyPairSync('ed25519');
const VENDOR_PEM = vendor.publicKey.export({ type: 'spki', format: 'pem' }).toString();

const CLAIMS: LicenseClaims = {
  plan: 'premium',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  machineId: null,
  centerCode: 'CS-CASA-001',
  centersAllowed: null,
  founderDiscountExpiresAt: null,
  demo: false,
};

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-license-'));
  filePath = join(dir, 'license.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Mirror of the vendor signer: base64(JSON claims) is the signed byte string. */
function claimsEnvelope(claims: unknown, key: KeyObject): { claims: string; signature: string } {
  const claimsB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64');
  const signature = signBytes(null, Buffer.from(claimsB64, 'utf8'), key).toString('base64');
  return { claims: claimsB64, signature };
}

function writeLicense(contents: unknown): void {
  writeFileSync(filePath, typeof contents === 'string' ? contents : JSON.stringify(contents));
}

function adapter(publicKey = VENDOR_PEM): Ed25519LicenseAdapter {
  return new Ed25519LicenseAdapter({ filePath, publicKey });
}

describe('Ed25519LicenseAdapter.verify', () => {
  it('returns "missing" when the file is absent', () => {
    expect(adapter().verify()).toEqual({ status: 'missing' });
  });

  it('returns "missing" without throwing when the path is unreadable (EISDIR)', () => {
    // A directory at the license path forces a non-ENOENT read error; verify()
    // must swallow it and report the expected offline state, never throw and
    // break startup (LicensePort contract). chmod is avoided — CI-as-root ignores it.
    mkdirSync(filePath);
    const port = adapter();
    expect(() => port.verify()).not.toThrow();
    expect(port.verify()).toEqual({ status: 'missing' });
  });

  it('returns "valid" with parsed claims for a genuine vendor-signed license', () => {
    writeLicense(claimsEnvelope(CLAIMS, vendor.privateKey));
    const result = adapter().verify();
    expect(result).toEqual({ status: 'valid', claims: CLAIMS });
  });

  it('returns "invalid-signature" when the claims are tampered after signing', () => {
    const envelope = claimsEnvelope(CLAIMS, vendor.privateKey);
    const tampered = { ...CLAIMS, plan: 'essentiel' as const };
    // Keep the original signature but swap in different claims bytes.
    writeLicense({
      claims: Buffer.from(JSON.stringify(tampered), 'utf8').toString('base64'),
      signature: envelope.signature,
    });
    expect(adapter().verify()).toEqual({ status: 'invalid-signature' });
  });

  it('returns "invalid-signature" when signed by a non-vendor key', () => {
    writeLicense(claimsEnvelope(CLAIMS, attacker.privateKey));
    expect(adapter().verify()).toEqual({ status: 'invalid-signature' });
  });

  it('returns "invalid-signature" for a non-JSON file', () => {
    writeLicense('not json at all');
    expect(adapter().verify()).toEqual({ status: 'invalid-signature' });
  });

  it('returns "invalid-signature" when the envelope shape is wrong', () => {
    writeLicense({ claims: '', signature: '' });
    expect(adapter().verify()).toEqual({ status: 'invalid-signature' });
  });

  it('returns "invalid-signature" when a correctly-signed payload has an unknown plan', () => {
    writeLicense(claimsEnvelope({ ...CLAIMS, plan: 'ultra' }, vendor.privateKey));
    expect(adapter().verify()).toEqual({ status: 'invalid-signature' });
  });

  it('does not check expiry — an expired but genuine license still verifies', () => {
    writeLicense(
      claimsEnvelope({ ...CLAIMS, expiresAt: '2000-01-01T00:00:00.000Z' }, vendor.privateKey),
    );
    const result = adapter().verify();
    expect(result.status).toBe('valid');
  });

  it('backfills SOU-104 claim fields as null for a pre-SOU-104 signed license', () => {
    // Sign a claim set WITHOUT centersAllowed / founderDiscountExpiresAt — the
    // signature covers only the bytes signed, so the newer optional fields default
    // to null rather than reading as tampered.
    const legacy = {
      plan: 'pro' as const,
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
      machineId: null,
      centerCode: 'CS-CASA-001',
    };
    writeLicense(claimsEnvelope(legacy, vendor.privateKey));
    const result = adapter().verify();
    expect(result).toEqual({
      status: 'valid',
      claims: { ...legacy, centersAllowed: null, founderDiscountExpiresAt: null, demo: false },
    });
  });
});

describe('Ed25519LicenseAdapter.verifyContent', () => {
  it('verifies a genuine envelope supplied as text without touching the disk', () => {
    const raw = JSON.stringify(claimsEnvelope(CLAIMS, vendor.privateKey));
    expect(adapter().verifyContent(raw)).toEqual({ status: 'valid', claims: CLAIMS });
  });

  it('returns invalid-signature for a non-vendor-signed envelope', () => {
    const raw = JSON.stringify(claimsEnvelope(CLAIMS, attacker.privateKey));
    expect(adapter().verifyContent(raw)).toEqual({ status: 'invalid-signature' });
  });

  it('returns invalid-signature for non-JSON text (never throws)', () => {
    expect(adapter().verifyContent('not a license')).toEqual({ status: 'invalid-signature' });
  });
});
