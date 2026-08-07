import type { CenterCode } from '@centresoutien/domain';

/**
 * The license file name for a center (SOU-104 M2, CLAUDE.md §5ter). Each center
 * has its own license, so the file is scoped by `centerCode` — a multi-center
 * owner activating center B must not overwrite center A's license, which would
 * surface as a spurious `wrong-center` restricted mode on switching back.
 *
 * The read path (Ed25519LicenseAdapter) and the write path (FsLicenseStore) both
 * derive their path from this one helper, so they can never disagree. Machine
 * identity stays machine-scoped (one file per laptop) — only the license is
 * per-center.
 */
export function licenseFileNameForCenter(centerCode: CenterCode): string {
  return `license.${centerCode}.json`;
}
