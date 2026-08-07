import type { LicenseVerification } from '../plans/license';

/**
 * Reads the local license file and verifies its Ed25519 signature against the
 * embedded vendor public key. The adapter (data layer) owns the crypto; the
 * domain owns what a verified license *means* (see `resolveActivePlan`).
 *
 * Synchronous on purpose: this is a single local read done once at startup,
 * mirroring the `Clock` / `IdGenerator` ports rather than the async repositories.
 * The future cloud tier resolves the plan from the subscription record
 * server-side and does not implement this port.
 *
 * Contract:
 * - Never throws. A missing or forged license is an expected offline state,
 *   returned as `{ status: 'missing' }` / `{ status: 'invalid-signature' }`.
 * - Does **not** check expiry — expiry is a Clock-driven rule owned by
 *   `resolveActivePlan`, since laptop wall-clock reads belong to the injected
 *   `Clock`, never the adapter.
 */
export interface LicensePort {
  /** Verify the installed license file. Used once at startup. */
  verify(): LicenseVerification;

  /**
   * Verify a license envelope supplied at activation time (pasted text or the
   * bytes of an imported file) that has NOT been installed yet — same signature +
   * shape check as {@link verify}, over caller-provided content. Never throws;
   * unreadable or non-envelope input returns `{ status: 'invalid-signature' }`.
   * The activation use case applies the binding + expiry rules to the result and
   * only then asks the {@link LicenseStorePort} to persist it.
   */
  verifyContent(raw: string): LicenseVerification;
}

/**
 * Persists a validated license envelope to the fixed local license path so the
 * next startup's {@link LicensePort.verify} reads it. The activation use case
 * calls this ONLY after the supplied envelope has passed signature + binding +
 * expiry — the store never validates, it just writes the exact bytes it is given.
 *
 * Synchronous, mirroring {@link LicensePort}: a single local write. The write must
 * be atomic (temp file + rename) so a crash mid-write can never leave a truncated
 * license the next startup would read as tampered.
 */
export interface LicenseStorePort {
  save(rawLicenseFile: string): void;
}

/**
 * The stable, machine-scoped identifier a license's `machineId` claim is checked
 * against. It is per *machine*, not per center DB — the same laptop returns the
 * same id whichever center is open, so a license bound to a machine matches across
 * that owner's centers. Generated and persisted on first read; never leaves the
 * device. Honest-user enforcement only (CLAUDE.md §5quater), never a secret.
 */
export interface MachineIdentity {
  machineId(): string;
}
