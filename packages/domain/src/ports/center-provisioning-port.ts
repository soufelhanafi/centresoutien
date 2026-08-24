import type { CenterProfileInput } from '../schemas/center';
import type { CenterCode } from '../value-objects/ids';

export type ProvisionCenterInput = {
  /** The validated profile of the center to create (name, address, phone, email). */
  readonly profile: CenterProfileInput;
};

export type ProvisionCenterResult = {
  /** The new per-center DB-file discriminator (`centre-{centreId}.db`). */
  readonly centreId: string;
  /** The new center's tenant code, stamped on every row it owns. */
  readonly centerCode: CenterCode;
};

/**
 * Creates a brand-new, fully isolated center on this machine (SOU-310). The
 * concrete adapter lives in the Electron main/data layer (it needs fs + SQLCipher
 * + the keychain); the domain declares only this seam so {@link CreateCenter} can
 * gate the Premium `org.multi-center` feature and delegate without knowing how a
 * DB file is created.
 *
 * Contract — the implementation MUST:
 * - allocate a fresh, collision-free `centreId` and a distinct `centerCode`;
 * - create a new encrypted `centre-{centreId}.db`, keyed with this center's own
 *   derived key, and migrate it to the current schema;
 * - seed the profile row, default weekly hours, the default niveau catalog, the
 *   trial (when unlicensed), and the ownership rows (Organization + the signed-in
 *   director's `owner` Membership) atomically;
 * - resolve the director from the active session itself — never from caller
 *   input — so a renderer cannot forge which user owns the new center;
 * - leave the currently-open center completely untouched; and
 * - on ANY failure, remove the partial DB file and throw `CenterProvisioningError`,
 *   so a failed provision is always "nothing created", never a broken center.
 *
 * It does NOT switch into the new center — {@link CreateCenter} drives the switch
 * through the separate `CenterSwitchPort` once provisioning succeeds.
 */
export interface CenterProvisioningPort {
  provision(input: ProvisionCenterInput): Promise<ProvisionCenterResult>;
}
