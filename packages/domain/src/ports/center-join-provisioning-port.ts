import type { CenterCode } from '../value-objects/ids';

export type JoinCenterFromHubInput = {
  /** The hub's LAN URL (e.g. `http://192.168.1.20:4747`), from discovery. */
  readonly baseUrl: string;
  /** The per-center pairing token the director read off the host. */
  readonly token: string;
  /** The center's tenant code (from the discovered TXT record) — the pull is
   *  scoped to it and the reconstructed center row is verified against it. */
  readonly centerCode: CenterCode;
};

export type JoinCenterFromHubResult = {
  /** The new LOCAL per-center DB-file discriminator (`centre-{centreId}.db`) — a
   *  fresh local id, independent of the host's own discriminator. */
  readonly centreId: string;
  readonly centerCode: CenterCode;
};

/**
 * Joins an existing center hosted on another laptop by COLD-BOOTSTRAPPING a local
 * replica from the hub feed (SOU-318) — the pull-based counterpart to
 * {@link CenterProvisioningPort}, which seeds a brand-new center locally. The
 * concrete adapter lives in the Electron main/data layer (it needs fs + SQLCipher
 * + the sync engine); the domain declares only this seam so {@link JoinCenter} can
 * gate `sync.multi-device` and delegate without knowing how a DB is filled.
 *
 * Contract — the implementation MUST:
 * - allocate a fresh, collision-free LOCAL `centreId` (never the host's);
 * - create + migrate a new encrypted `centre-{centreId}.db`, keyed with this
 *   center's own derived key;
 * - run one initial pull against the hub with the pairing token, applying the
 *   whole feed so the local DB reconstructs the center identity, users, and data;
 * - VERIFY the reconstructed center row exists and its `centerCode` matches the
 *   requested one — a wrong token, an empty feed, or a mismatched center is a
 *   failed join, not a half-built center;
 * - persist the hub-client config for the new center so it keeps syncing on boot;
 * - leave the currently-open center completely untouched; and
 * - on ANY failure remove the partial DB + client config and throw
 *   `CenterJoinError`, so a failed join is always "nothing created".
 *
 * It does NOT switch into the joined center — {@link JoinCenter} drives the switch
 * through the separate `CenterSwitchPort` once the pull succeeds.
 */
export interface CenterJoinProvisioningPort {
  provisionFromHub(input: JoinCenterFromHubInput): Promise<JoinCenterFromHubResult>;

  /**
   * Removes a center that was joined but never entered — the rollback
   * {@link JoinCenter} runs when the post-join switch fails. Idempotent,
   * best-effort, and never throws (the caller is already unwinding a failure).
   */
  discard(centreId: string): Promise<void>;
}
