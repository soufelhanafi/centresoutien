import { DomainError } from './plan-errors';

/**
 * Base class for every license-resolution failure. Carried on a rejected
 * {@link LicenseResolution} so the activation UI (SOU-104) can branch on the
 * concrete subclass; SOU-98 itself never throws these — a bad license silently
 * falls back to `essentiel` at startup (the app stays fully usable).
 */
export class LicenseError extends DomainError {}

/** No license file is present — the default state of a fresh install. */
export class LicenseMissingError extends LicenseError {
  constructor() {
    super('No license file is present.');
  }
}

/**
 * The license file exists but its Ed25519 signature does not verify against the
 * embedded vendor public key — a forged, corrupt, or wrong-key file.
 */
export class LicenseSignatureInvalidError extends LicenseError {
  constructor() {
    super('License signature verification failed.');
  }
}

/** The signature is valid but the license expired on or before "now". */
export class LicenseExpiredError extends LicenseError {
  constructor(readonly expiresAt: string) {
    super(`License expired on ${expiresAt}.`);
  }
}
