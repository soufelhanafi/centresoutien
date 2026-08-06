import type { PlanId } from '@centresoutien/domain';

/**
 * The presentation contract for license activation (SOU-104). These are the IPC
 * DTO shapes the domain-backend published for the `license.status` and
 * `license.activate` channels — not domain entities, so they live renderer-side
 * as the stand-in until those channels merge (branch `feature/SOU-104-domain`).
 * `PlanId` is imported from the domain, never re-declared.
 *
 * The whole UI depends only on {@link LicenseApi}; the concrete adapter (mock
 * today, IPC after integration) is swapped in one place — see `license-api.ts`.
 */

export type LicenseStatusValue =
  | 'active'
  | 'missing'
  | 'invalid-signature'
  | 'expired'
  | 'wrong-machine'
  | 'wrong-center';

export type LicenseRejectionReason =
  | 'malformed'
  | 'invalid-signature'
  | 'wrong-machine'
  | 'wrong-center'
  | 'expired';

/** Current license state — drives the activation screen and the Settings tab. */
export type LicenseStatusView = {
  status: LicenseStatusValue;
  plan: PlanId;
  restricted: boolean;
  expiresAt: string | null;
  centersAllowed: number | null;
  founderDiscountExpiresAt: string | null;
  founderDiscountExpired: boolean;
};

/** Outcome of a paste/import activation attempt. Branch the UI on the union tag. */
export type LicenseActivateResult =
  | {
      status: 'activated';
      plan: PlanId;
      expiresAt: string | null;
      centersAllowed: number | null;
      founderDiscount: { expiresAt: string | null; expired: boolean };
    }
  | { status: 'rejected'; reason: LicenseRejectionReason };

export interface LicenseApi {
  status(): Promise<LicenseStatusView>;
  activate(license: string): Promise<LicenseActivateResult>;
}
