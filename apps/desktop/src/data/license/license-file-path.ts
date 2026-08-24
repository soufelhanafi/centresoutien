import type { CenterCode } from '@centresoutien/domain';

/** The machine-scoped license file name: one license per laptop (SOU-315). */
export const LICENSE_FILE_NAME = 'license.json';

/**
 * The machine-scoped license path (SOU-315, CLAUDE.md §5ter). A license belongs
 * to the laptop, not to any single center: a Premium license entitles every
 * center the director provisions up to its cap, so all centers on one machine
 * read the SAME file. Center binding is still enforced by the license's optional
 * `centerCode` claim — a license bound to one center resolves `wrong-center`
 * (and stays locked) when any other center is opened, while an unbound
 * multi-center license resolves `active` everywhere.
 *
 * The read path (Ed25519LicenseAdapter) and the write path (FsLicenseStore) both
 * derive their path from this one helper, so they can never disagree. Machine
 * identity stays machine-scoped too (one `machine-id` file per laptop, shared by
 * every center).
 */
export function licenseFileName(): string {
  return LICENSE_FILE_NAME;
}

/**
 * The legacy per-center license file name (SOU-104 M2), read ONLY as a
 * backward-compat fallback when the machine-scoped {@link licenseFileName} is
 * absent (SOU-315). New activations always write the machine-scoped file; this
 * path is how an install that activated before SOU-315 keeps its entitlement
 * without re-activating.
 */
export function legacyLicenseFileNameForCenter(centerCode: CenterCode): string {
  return `license.${centerCode}.json`;
}
