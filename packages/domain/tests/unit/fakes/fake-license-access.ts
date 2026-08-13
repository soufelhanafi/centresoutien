import type { LicenseAccess } from '../../../src/ports/license-access';

export function fakeLicenseAccess(active: boolean): LicenseAccess {
  return { hasActiveLicense: () => active };
}
