/**
 * Answers whether the current installation has a verified, unexpired license.
 * Setup uses this only to decide whether a new center receives a trial.
 */
export interface LicenseAccess {
  hasActiveLicense(): boolean;
}
