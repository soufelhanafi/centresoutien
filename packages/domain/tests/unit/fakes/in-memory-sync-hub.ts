import type { Clock } from '../../../src/ports/clock';
import { entityKey, type ChangeBatch, type HubChange, type PushResult, type SyncCursor, type SyncHubPort } from '../../../src/ports/sync-hub-port';
import { SCHEMA_VERSION } from '../../../src/sync/schema-version';
import { SchemaTooOldError } from '../../../src/errors/sync-errors';
import type { CenterCode, DeviceId } from '../../../src/value-objects/ids';
import type { LocalChange } from '../../../src/ports/sync-hub-port';

/**
 * In-memory {@link SyncHubPort} — a faithful dumb mailbox (SOU-80 §2), so the
 * engine's pull→resolve→push is testable without the HTTP embedded hub. It
 * stores canonical state with `version` counters, an append-only per-center
 * change feed, and one cursor per `(deviceId, centreId)`. It holds no business
 * logic and no merge rules — exactly like the real hub.
 */
export class InMemorySyncHub implements SyncHubPort {
  private readonly clock: Clock;
  readonly schemaVersion: number;
  /** entityKey(centreId, entityType, entityId) → canonical { version, entity }. */
  private readonly canonical = new Map<string, { version: number; entity: Record<string, unknown> }>();
  /** centreId → append-only feed of accepted writes. */
  private readonly feedByCentre = new Map<CenterCode, HubChange[]>();
  /** `${deviceId}|${centreId}` → last consumed cursor. */
  private readonly cursors = new Map<string, SyncCursor>();

  /** How many schema-mismatch pushes were rejected (asserted in tests). */
  schemaRejections = 0;

  constructor(clock: Clock, options?: { schemaVersion?: number }) {
    this.clock = clock;
    this.schemaVersion = options?.schemaVersion ?? SCHEMA_VERSION;
  }

  private centreKey(centreId: CenterCode, entityType: string, entityId: string): string {
    return `${centreId}|${entityKey(entityType, entityId)}`;
  }

  private feedOf(centreId: CenterCode): HubChange[] {
    let feed = this.feedByCentre.get(centreId);
    if (!feed) {
      feed = [];
      this.feedByCentre.set(centreId, feed);
    }
    return feed;
  }

  private cursorKey(deviceId: DeviceId, centreId: CenterCode): string {
    return `${deviceId}|${centreId}`;
  }

  /** Test probe: the canonical entity for an entity, or null when never pushed. */
  canonicalEntity(centreId: CenterCode, entityType: string, entityId: string): Record<string, unknown> | null {
    return this.canonical.get(this.centreKey(centreId, entityType, entityId))?.entity ?? null;
  }

  canonicalVersion(centreId: CenterCode, entityType: string, entityId: string): number {
    return this.canonical.get(this.centreKey(centreId, entityType, entityId))?.version ?? 0;
  }

  feed(centreId: CenterCode): readonly HubChange[] {
    return this.feedOf(centreId);
  }

  async pullChanges(
    centreId: CenterCode,
    cursor: SyncCursor | null,
    deviceId: DeviceId,
    limit?: number,
  ): Promise<ChangeBatch> {
    const key = this.cursorKey(deviceId, centreId);
    // A null cursor always means "from the head" — never a stored per-device
    // cursor, so a fresh install replays the whole feed (SOU-80 §3).
    const start = cursor?.seq ?? 0;
    const feed = this.feedOf(centreId);
    const after = feed.filter((change) => change.seq > start);
    const cap = limit && limit > 0 ? limit : after.length;
    const changes = after.slice(0, cap);
    // Cursor is the position AFTER the last delivered change — a chunked pull
    // resumes exactly here — and `remaining` is what is still queued past it.
    const lastSeq = changes.length > 0 ? (changes[changes.length - 1]?.seq ?? start) : start;
    const nextCursor = { seq: lastSeq };
    const remaining = after.length - changes.length;
    this.cursors.set(key, nextCursor);
    return {
      changes,
      cursor: nextCursor,
      schemaVersion: this.schemaVersion,
      hubTime: this.clock.now(),
      remaining,
    };
  }

  async pushChanges(input: {
    centreId: CenterCode;
    deviceId: DeviceId;
    changes: readonly LocalChange[];
    schemaVersion: number;
  }): Promise<PushResult> {
    if (input.schemaVersion < this.schemaVersion) {
      this.schemaRejections++;
      throw new SchemaTooOldError(input.schemaVersion, this.schemaVersion);
    }
    const feed = this.feedOf(input.centreId);

    // Atomic version check across the WHOLE batch before touching anything:
    // two simultaneous syncs can never both win. The base is on each change.
    for (const change of input.changes) {
      const base = change.baseVersion;
      const current = this.canonicalVersion(input.centreId, change.entityType, change.entityId);
      if (base !== current) {
        const deviceCursor = this.cursors.get(this.cursorKey(input.deviceId, input.centreId))?.seq ?? 0;
        return { status: 'rejected-stale', cursor: { seq: deviceCursor } };
      }
    }

    const versions: Record<string, number> = {};
    const firstSeq = feed.length + 1;
    for (const change of input.changes) {
      const key = this.centreKey(input.centreId, change.entityType, change.entityId);
      const current = this.canonical.get(key)?.version ?? 0;
      const version = current + 1;
      // Canonical state carries its own version, so every device applies an
      // identical snapshot — clean convergence (SOU-80 "done when").
      const stamped = { ...change.entity, version };
      this.canonical.set(key, { version, entity: stamped });
      versions[entityKey(change.entityType, change.entityId)] = version;
      feed.push({
        entityType: change.entityType,
        entityId: change.entityId,
        version,
        seq: feed.length + 1,
        op: change.op,
        entity: stamped,
        changedFields: change.changedFields,
        deviceId: change.deviceId,
        updatedBy: change.updatedBy,
        deviceSeq: change.seq,
        receivedAt: this.clock.now(),
      });
    }
    const lastSeq = feed.length;

    // The device's cursor only advances past rows it has actually consumed
    // (its last pull, plus this contiguous batch). If another device's row
    // landed in the gap, keep the consumed cursor so the next pull re-delivers
    // it — the engine's version-skip dedupes this device's own batch. Mirrors
    // SqliteHubStore.acceptedCursor (SOU-90 reviewer finding B1).
    const key = this.cursorKey(input.deviceId, input.centreId);
    const consumed = this.cursors.get(key) ?? { seq: 0 };
    const cursor = firstSeq <= lastSeq && consumed.seq + 1 === firstSeq ? { seq: lastSeq } : consumed;
    this.cursors.set(key, cursor);
    return { status: 'accepted', versions, cursor };
  }

  async getCursor(deviceId: DeviceId, centreId: CenterCode): Promise<SyncCursor | null> {
    return this.cursors.get(this.cursorKey(deviceId, centreId)) ?? null;
  }
}
