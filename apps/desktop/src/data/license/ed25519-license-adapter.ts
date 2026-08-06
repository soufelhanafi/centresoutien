import { readFileSync } from 'node:fs';
import { createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto';
import {
  licenseClaimsSchema,
  licenseFileSchema,
  type LicensePort,
  type LicenseVerification,
} from '@centresoutien/domain';

export type Ed25519LicenseAdapterOptions = {
  /** Absolute path to the license file (JSON envelope). */
  readonly filePath: string;
  /** Vendor public key, SPKI PEM. */
  readonly publicKey: string;
};

/**
 * Reads a local license file and verifies its Ed25519 signature against the
 * vendor public key — the concrete {@link LicensePort} for the desktop tier
 * (SOU-98). The file is a JSON envelope `{ claims, signature }` where `claims` is
 * base64(JSON of the claim set) and `signature` is the base64 Ed25519 signature
 * over the exact `claims` bytes, so verification needs no canonical re-encoding.
 *
 * All crypto stays here in the data layer; the domain never sees a key. Expiry is
 * intentionally NOT checked here — that is a Clock-driven rule in
 * `resolveActivePlan`. This adapter reports only what the signature proves.
 */
export class Ed25519LicenseAdapter implements LicensePort {
  private readonly publicKey: KeyObject;

  constructor(private readonly options: Ed25519LicenseAdapterOptions) {
    this.publicKey = createPublicKey(options.publicKey);
  }

  verify(): LicenseVerification {
    const raw = this.readFile();
    if (raw === null) return { status: 'missing' };

    const claimsJson = this.verifiedClaimsJson(raw);
    if (claimsJson === null) return { status: 'invalid-signature' };

    const parsed = licenseClaimsSchema.safeParse(this.parseJson(claimsJson));
    if (!parsed.success) return { status: 'invalid-signature' };

    return { status: 'valid', claims: parsed.data };
  }

  /** File contents, or null when the file is absent. Any other read error surfaces. */
  private readFile(): string | null {
    try {
      return readFileSync(this.options.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /**
   * Verifies the envelope's signature over its `claims` bytes and returns the
   * decoded claims JSON string, or null when the file is malformed or the
   * signature does not check out.
   */
  private verifiedClaimsJson(raw: string): string | null {
    const envelope = licenseFileSchema.safeParse(this.parseJson(raw));
    if (!envelope.success) return null;

    const signedBytes = Buffer.from(envelope.data.claims, 'utf8');
    const signature = Buffer.from(envelope.data.signature, 'base64');
    if (!verifySignature(null, signedBytes, this.publicKey, signature)) return null;

    return Buffer.from(envelope.data.claims, 'base64').toString('utf8');
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
