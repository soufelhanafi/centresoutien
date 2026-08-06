import type { LicenseStorePort } from '../../../src/ports/license-port';

/** In-memory {@link LicenseStorePort}: records the last saved envelope for assertions. */
export class InMemoryLicenseStore implements LicenseStorePort {
  saved: string | null = null;
  saveCount = 0;

  save(rawLicenseFile: string): void {
    this.saved = rawLicenseFile;
    this.saveCount += 1;
  }
}
