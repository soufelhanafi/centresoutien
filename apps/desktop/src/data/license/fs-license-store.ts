import { renameSync, writeFileSync } from 'node:fs';
import type { LicenseStorePort } from '@centresoutien/domain';

/**
 * Writes a validated license envelope to the per-center license path (SOU-104),
 * the same path {@link Ed25519LicenseAdapter} reads at startup (both derived from
 * `licenseFileNameForCenter`, so read + write always agree). The activation use
 * case validates before calling this; the store only persists.
 *
 * The write is atomic — a temp file plus `rename` — so a crash mid-write can never
 * leave a half-written `license.json` that the next startup would read as tampered
 * and drop the center into restricted mode.
 */
export class FsLicenseStore implements LicenseStorePort {
  constructor(private readonly filePath: string) {}

  save(rawLicenseFile: string): void {
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, rawLicenseFile, 'utf8');
    renameSync(tempPath, this.filePath);
  }
}
