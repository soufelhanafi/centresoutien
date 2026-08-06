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

/**
 * The signature is valid but the license is bound to a different machine than the
 * one running the app. Honest-user enforcement (CLAUDE.md §5quater): a Premium
 * license copied to a second laptop must not grant its tier there.
 */
export class LicenseWrongMachineError extends LicenseError {
  constructor(
    readonly expectedMachineId: string,
    readonly actualMachineId: string,
  ) {
    super('License is bound to a different machine.');
  }
}

/**
 * The signature is valid but the license is bound to a different center than the
 * one open. The center is the tenant (CLAUDE.md §5ter): a license issued for one
 * center never activates another.
 */
export class LicenseWrongCenterError extends LicenseError {
  constructor(
    readonly expectedCenterCode: string,
    readonly actualCenterCode: string,
  ) {
    super('License is bound to a different center.');
  }
}

/**
 * The supplied text is not a well-formed license envelope at all — empty input,
 * non-JSON, or a shape that fails structural validation before any signature
 * check. Distinct from {@link LicenseSignatureInvalidError}, which means a
 * well-formed envelope whose signature does not verify.
 */
export class LicenseMalformedError extends LicenseError {
  constructor() {
    super('The provided license file is not readable.');
  }
}
