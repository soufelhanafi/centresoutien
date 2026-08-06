import type { LicensePort } from '../../../src/ports/license-port';
import type { LicenseVerification } from '../../../src/plans/license';

/**
 * In-memory {@link LicensePort} for use-case tests. The installed verification is
 * seeded via the constructor; `verifyContent` looks the raw text up in a seeded
 * map so a test can hand `activate` a "known good" or "known bad" envelope without
 * any crypto. Unseeded content verifies as `invalid-signature`, matching the real
 * adapter's fail-closed default.
 */
export class InMemoryLicensePort implements LicensePort {
  private readonly byContent = new Map<string, LicenseVerification>();

  constructor(private installed: LicenseVerification = { status: 'missing' }) {}

  verify(): LicenseVerification {
    return this.installed;
  }

  verifyContent(raw: string): LicenseVerification {
    return this.byContent.get(raw) ?? { status: 'invalid-signature' };
  }

  seedContent(raw: string, verification: LicenseVerification): void {
    this.byContent.set(raw, verification);
  }

  setInstalled(verification: LicenseVerification): void {
    this.installed = verification;
  }
}
