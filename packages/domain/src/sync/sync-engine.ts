import type { Clock } from '../ports/clock';
import { entityKey, type SyncCursor, type SyncHubPort } from '../ports/sync-hub-port';
import type { PlanPolicy } from '../plans/plan-policy';
import { SchemaTooOldError } from '../errors/sync-errors';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { SyncConflict } from './conflicts';
import type { DuplicateMatcher } from './duplicate-matcher';
import { SCHEMA_VERSION } from './schema-version';
import { ChangeResolver } from './resolve-changes';
import type { LocalSyncRepository } from './sync-local-repository';

/**
 * The sync cycle: **pull → resolve → push** (SOU-80 §3). Every sync, in that
 * order, on every device:
 *
 * 1. Pull everything the hub accepted since this device's cursor.
 * 2. Resolve locally (`ChangeResolver`): non-overlapping field edits auto-merge
 *    silently, delete-vs-edit and same-field clashes go to a human, probable
 *    duplicates are flagged.
 * 3. Push with `baseVersions`. The hub accepts iff each base equals its current
 *    canonical version, then assigns a fresh `version`. A stale push is rejected
 *    whole and the cycle re-runs — one cheap retry loop (capped) serializes
 *    concurrent syncs without locks. Resolution always happens on the device
 *    that syncs second; the others converge on their next pull.
 *
 * Ordering truth is `version` + the hub's atomic push check, never wall clocks.
 * A device whose clock is absurdly ahead is flagged (`deviceClockSkew`), and its
 * data still syncs — decided by versions, not timestamps.
 */
export const MAX_SYNC_RETRIES = 5;
export const CLOCK_SKEW_THRESHOLD_MS = 15 * 60 * 1000;

export type SyncEngineInput = {
  hub: SyncHubPort;
  local: LocalSyncRepository;
  clock: Clock;
  /** Gate for `sync.multi-device` — the domain check is the only one that counts. */
  plan: PlanPolicy;
  deviceId: DeviceId;
  updatedBy: UserId;
  centreId: CenterCode;
  /**
   * `sync.conflict-resolution` permission. The engine never auto-resolves a
   * clash either way — this only decides whether the conflicts surface as an
   * interactive popup (`granted`) or queue into the "conflits en attente"
   * inbox for an admin (`queued`).
   */
  userCanResolve: boolean;
  maxRetries?: number;
};

export type SyncResult = {
  readonly status: 'synced' | 'retries-exhausted';
  /** Entities applied or auto-merged from the pull. */
  readonly applied: number;
  /** Entities pushed and accepted by the hub. */
  readonly pushed: number;
  readonly conflicts: readonly SyncConflict[];
  readonly cursor: SyncCursor | null;
  /** True when the device clock diverged absurdly from the hub's — flagged, not trusted. */
  readonly deviceClockSkew: boolean;
  readonly resolutionPermission: 'granted' | 'queued';
};

export class SyncEngine {
  private readonly hub: SyncHubPort;
  private readonly local: LocalSyncRepository;
  private readonly clock: Clock;
  private readonly plan: PlanPolicy;
  private readonly deviceId: DeviceId;
  private readonly updatedBy: UserId;
  private readonly centreId: CenterCode;
  private readonly userCanResolve: boolean;
  private readonly maxRetries: number;
  private readonly resolver: ChangeResolver;

  constructor(input: SyncEngineInput) {
    this.hub = input.hub;
    this.local = input.local;
    this.clock = input.clock;
    this.plan = input.plan;
    this.deviceId = input.deviceId;
    this.updatedBy = input.updatedBy;
    this.centreId = input.centreId;
    this.userCanResolve = input.userCanResolve;
    this.maxRetries = input.maxRetries ?? MAX_SYNC_RETRIES;
    this.resolver = new ChangeResolver(input.local, input.clock, input.deviceId, input.updatedBy, input.centreId);
  }

  async run(matcher: DuplicateMatcher): Promise<SyncResult> {
    this.plan.require('sync.multi-device');

    const conflicts: SyncConflict[] = [];
    let applied = 0;
    let pushed = 0;
    let deviceClockSkew = false;

    // The device's own cursor is the source of truth. A fresh install (empty
    // local DB) has no cursor and pulls from 0 — the hub's per-device cursor is
    // the hub's bookkeeping (rejection freshness, feed retention), never a
    // shortcut to skip pulls, or a fresh install could silently miss data.
    let cursor = this.local.getCursor();

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const batch = await this.hub.pullChanges(this.centreId, cursor, this.deviceId);
      if (batch.schemaVersion > SCHEMA_VERSION) {
        // Too old to write. Pull is additive-safe, but a too-old device cannot
        // round-trip shapes other devices already wrote — stop before it diverges.
        throw new SchemaTooOldError(SCHEMA_VERSION, batch.schemaVersion);
      }
      deviceClockSkew = deviceClockSkew || this.isClockSkewed(batch.hubTime);

      applied += this.resolver.resolveBatch(batch.changes, conflicts, matcher);

      const push = await this.pushPending(batch.cursor);
      pushed += push.pushed;
      if (push.status === 'accepted') {
        this.local.setCursor(push.cursor);
        return this.result('synced', applied, pushed, conflicts, push.cursor, deviceClockSkew);
      }
      // Rejected-stale: a concurrent sync won the version race for some entity.
      // Cursor is unchanged, so the next pull re-delivers the winning change and
      // this device re-resolves (idempotent via the version skip in the resolver).
      cursor = push.cursor;
    }

    this.local.setCursor(cursor ?? { seq: 0 });
    return this.result('retries-exhausted', applied, pushed, conflicts, cursor, deviceClockSkew);
  }

  private result(
    status: SyncResult['status'],
    applied: number,
    pushed: number,
    conflicts: readonly SyncConflict[],
    cursor: SyncCursor | null,
    deviceClockSkew: boolean,
  ): SyncResult {
    return {
      status,
      applied,
      pushed,
      conflicts,
      cursor,
      deviceClockSkew,
      resolutionPermission: this.userCanResolve ? 'granted' : 'queued',
    };
  }

  private async pushPending(noopCursor: SyncCursor): Promise<
    | { status: 'accepted'; cursor: SyncCursor; pushed: number }
    | { status: 'rejected-stale'; cursor: SyncCursor; pushed: number }
  > {
    const pending = this.local.listPending();
    if (pending.length === 0) {
      // Nothing to write — the pull already advanced the cursor; no hub round-trip.
      return { status: 'accepted', cursor: noopCursor, pushed: 0 };
    }

    const baseVersions: Record<string, number> = {};
    for (const change of pending) {
      baseVersions[entityKey(change.entityType, change.entityId)] = change.baseVersion;
    }

    const result = await this.hub.pushChanges({
      centreId: this.centreId,
      deviceId: this.deviceId,
      changes: pending,
      baseVersions,
      schemaVersion: SCHEMA_VERSION,
    });

    if (result.status === 'accepted') {
      for (const change of pending) {
        const assigned = result.versions[entityKey(change.entityType, change.entityId)];
        if (assigned !== undefined) {
          this.local.markSynced(change.entityType, change.entityId, assigned);
        }
      }
      return { status: 'accepted', cursor: result.cursor, pushed: pending.length };
    }
    return { status: 'rejected-stale', cursor: result.cursor, pushed: 0 };
  }

  private isClockSkewed(hubTime: Date): boolean {
    const diff = Math.abs(this.clock.now().getTime() - hubTime.getTime());
    return diff > CLOCK_SKEW_THRESHOLD_MS;
  }
}
