import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterJoinProvisioningPort } from '../ports/center-join-provisioning-port';
import type { CenterSwitchPort } from '../ports/center-switch-port';
import type { CenterCode } from '../value-objects/ids';
import { joinCenterSchema } from '../schemas/join-center';

export type JoinCenterInput = {
  readonly baseUrl: string;
  readonly token: string;
  readonly centerCode: string;
};

export type JoinCenterResult = { readonly ok: true; readonly centreId: string; readonly centerCode: string };

/**
 * Joins an existing center hosted on another laptop and switches into it
 * (SOU-318) — the pull-based counterpart to {@link CreateCenter}. It gates the
 * multi-device sync feature server-side BEFORE any hub is contacted, cold-
 * bootstraps a local replica from the hub feed via the provisioner, then hands off
 * to the SOU-96 live hot-swap so the app lands in the joined center (already
 * populated, so its first-run/auth gates see the synced admin and show login).
 *
 * Joining a second device to ONE center is single-center, so it is gated on
 * `sync.multi-device` (all tiers under the MVP tier collapse), NOT the Premium
 * `org.multi-center` — that flag is for cross-center CONSOLIDATION, which this is
 * not. UI hiding is cosmetic; this is the honest-user enforcement.
 */
export class JoinCenter {
  constructor(
    private readonly plan: PlanPolicy,
    private readonly provisioner: CenterJoinProvisioningPort,
    private readonly switcher: CenterSwitchPort,
  ) {}

  async execute(input: JoinCenterInput): Promise<JoinCenterResult> {
    this.plan.require('sync.multi-device');
    const parsed = joinCenterSchema.parse(input);
    const { centreId, centerCode } = await this.provisioner.provisionFromHub({
      baseUrl: parsed.baseUrl,
      token: parsed.token,
      centerCode: parsed.centerCode as CenterCode,
    });
    // The joined replica is durable on disk before the switch. If the hot-swap
    // fails, roll the join back so a failed join never leaves an orphan center
    // selectable in the switcher — joining is all-or-nothing, like adding.
    try {
      await this.switcher.switchTo(centreId);
    } catch (error) {
      await this.provisioner.discard(centreId);
      throw error;
    }
    return { ok: true, centreId, centerCode };
  }
}
