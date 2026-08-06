import { describe, it, expect } from 'vitest';
import { MAX_SYNC_RETRIES } from '../../../src/sync/sync-engine';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { planWithoutFeature } from '../fakes/plans';
import { SchemaTooOldError } from '../../../src/errors/sync-errors';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { SCHEMA_VERSION } from '../../../src/sync/schema-version';
import type { SyncHubPort, SyncCursor, ChangeBatch, PushResult, LocalChange } from '../../../src/ports/sync-hub-port';
import type { CenterCode, DeviceId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncHub } from '../fakes/in-memory-sync-hub';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { CENTER, DEV_A, DEV_B, DEV_C, S1, S2, S4, USER_A, USER_B, USER_C, makeEngine, matcherFor, studentEntity } from './sync-engine-helpers';

/**
 * Concurrency, retries, and robustness of the sync cycle (SOU-80 §3 + §7):
 * rejected-stale pushes re-cycle (capped), retries are idempotent, clock-skew
 * is flagged but never trusted, the schema handshake stops too-old devices,
 * and the `sync.conflict-resolution` permission decides popup vs inbox.
 */
describe('SyncEngine — concurrency, retries, and robustness', () => {
  it('a persistently stale push exhausts the retry cap, surfacing an error state', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    const rejecting = new AlwaysRejectHub(hub, MAX_SYNC_RETRIES);
    const result = await makeEngine({ hub: rejecting, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    expect(result.status).toBe('retries-exhausted');
    expect(rejecting.pushCalls).toBe(MAX_SYNC_RETRIES);
    // The edit is still safe locally — nothing was lost, nothing was clobbered.
    expect(a.entity('students', S1)).toBeDefined();
  });

  it('retry re-deliveries are version-skipped and conflicts de-duplicate — idempotent re-cycle', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    // Baseline: B has S1 (v1). A then pushes S2 (fresh to B) and edits S1's phone.
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));
    // Unique name so S2's duplicate detection never flags against S1/S4.
    a.writeLocal('students', S2, studentEntity(S2, { name: { fr: 'Unique', ar: 'مميز' } }), ['name'], USER_A);
    a.writeLocal('students', S1, studentEntity(S1, { phone: '0666666666' }), ['phone'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    // B's offline edits: a phone clash on S1 (blocked) + a fresh S4 to push.
    b.writeLocal('students', S1, studentEntity(S1, { phone: '0677777777' }), ['phone'], USER_B);
    b.writeLocal('students', S4, studentEntity(S4), ['name'], USER_B);

    const rejecting = new AlwaysRejectHub(hub, 3);
    const result = await makeEngine({ hub: rejecting, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(result.status).toBe('retries-exhausted');
    // S2 was applied exactly once across all re-cycles (version-skip), and the
    // S1 clash was surfaced exactly once (de-duplicated).
    expect(result.applied).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].kind).toBe('field-clash');
  });

  it('a zero-retry config surfaces retries-exhausted immediately without touching the hub', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);

    const result = await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A, maxRetries: 0 }).run(matcherFor(a));

    expect(result.status).toBe('retries-exhausted');
    expect(result.cursor).toBeNull();
    expect(a.getCursor()).toEqual({ seq: 0 }); // defensive cursor fallback
  });

  it('device clock skew is flagged but never stops the sync — versions still decide', async () => {
    const hubClock = fakeClock('2026-09-01T10:00:00Z'); // hub thinks it is a month later
    const hub = new InMemorySyncHub(hubClock);
    const deviceClock = fakeClock('2026-08-01T10:00:00Z'); // device clock is way behind
    const a = new InMemorySyncLocalRepository(deviceClock, DEV_A);
    const b = new InMemorySyncLocalRepository(hubClock, DEV_B);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    const resultA = await makeEngine({ hub, local: a, clock: deviceClock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    const resultB = await makeEngine({ hub, local: b, clock: hubClock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(resultA.status).toBe('synced');
    expect(resultA.deviceClockSkew).toBe(true);
    expect(resultB.deviceClockSkew).toBe(false);
    expect(b.entity('students', S1)).toBeDefined(); // data still syncs
  });

  it('a future-stamped edit still loses to the higher version — never wall-clock winner', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    // B's clock is absurdly ahead (a month in the future).
    const futureClock = fakeClock('2026-10-01T10:00:00Z');
    const bFuture = new InMemorySyncLocalRepository(futureClock, DEV_B);
    bFuture.applyInbound('students', S1, studentEntity(S1), 1);
    bFuture.writeLocal('students', S1, studentEntity(S1, { phone: '0677777777' }), ['phone'], USER_B);

    a.writeLocal('students', S1, studentEntity(S1, { phone: '0666666666' }), ['phone'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    const resultB = await makeEngine({ hub, local: bFuture, clock: futureClock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(bFuture));

    expect(resultB.conflicts).toHaveLength(1); // clash, not auto-resolve
    expect(hub.canonicalEntity(CENTER, 'students', S1)?.phone).toBe('0666666666'); // A won
  });

  it('schema handshake: an older device is stopped before it diverges', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock, { schemaVersion: SCHEMA_VERSION + 1 });
    const a = new InMemorySyncLocalRepository(clock, DEV_A);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    const engine = makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A });

    await expect(engine.run(matcherFor(a))).rejects.toBeInstanceOf(SchemaTooOldError);
    // Nothing reached the hub, nothing was lost locally.
    expect(hub.feed(CENTER)).toHaveLength(0);
    expect(a.entity('students', S1)).toBeDefined();

    // Hub-side handshake on push also rejects the too-old device directly.
    await expect(
      hub.pushChanges({
        centreId: CENTER,
        deviceId: DEV_A,
        changes: [],
        baseVersions: {},
        schemaVersion: SCHEMA_VERSION,
      }),
    ).rejects.toBeInstanceOf(SchemaTooOldError);
    expect(hub.schemaRejections).toBe(1);
  });

  it('pull tolerates fields this device does not know (additive migrations)', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);

    // Another device (same schema today, ahead tomorrow) pushed a record with an
    // unknown future field.
    await hub.pushChanges({
      centreId: CENTER,
      deviceId: DEV_C,
      schemaVersion: SCHEMA_VERSION,
      changes: [{
        entityType: 'students',
        entityId: S1,
        deviceId: DEV_C,
        baseVersion: 0,
        op: 'create',
        entity: studentEntity(S1, { level: '3AC', futuristicField: true }),
        changedFields: ['name', 'level'],
        seq: 1,
        at: clock.now(),
        updatedBy: USER_C,
      }],
      baseVersions: {},
    });

    const result = await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    expect(result.status).toBe('synced');
    expect(result.applied).toBe(1);
    expect(a.entity('students', S1)?.level).toBe('3AC');
  });

  it('unauthorized resolver: safe merges still apply, clashes are queued, nothing else written', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    a.writeLocal('students', S1, studentEntity(S1, { phone: '0666666666' }), ['phone'], USER_A);
    b.writeLocal('students', S1, studentEntity(S1, { phone: '0677777777' }), ['phone'], USER_B);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B, userCanResolve: false }).run(matcherFor(b));

    expect(resultB.resolutionPermission).toBe('queued');
    expect(resultB.conflicts).toHaveLength(1); // clash queued for an admin, not resolved
    expect(b.isBlocked('students', S1)).toBe(true); // nothing pushed
    expect(hub.canonicalEntity(CENTER, 'students', S1)?.phone).toBe('0666666666');
  });

  it('requires the sync.multi-device feature at the domain gate', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);

    const engine = makeEngine({
      hub,
      local: a,
      clock,
      deviceId: DEV_A,
      updatedBy: USER_A,
      plan: new PlanPolicy(planWithoutFeature('sync.multi-device')),
    });

    await expect(engine.run(matcherFor(a))).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    expect(hub.feed(CENTER)).toHaveLength(0);
  });
});

/** A hub that rejects every push — forces the retry cap. */
class AlwaysRejectHub implements SyncHubPort {
  pushCalls = 0;
  constructor(
    private readonly inner: SyncHubPort,
    private readonly maxRetries: number,
  ) {}

  pullChanges(centreId: CenterCode, cursor: SyncCursor | null, deviceId: DeviceId): Promise<ChangeBatch> {
    return this.inner.pullChanges(centreId, cursor, deviceId);
  }

  getCursor(deviceId: DeviceId, centreId: CenterCode): Promise<SyncCursor | null> {
    return this.inner.getCursor(deviceId, centreId);
  }

  async pushChanges(input: {
    centreId: CenterCode;
    deviceId: DeviceId;
    changes: readonly LocalChange[];
    baseVersions: Readonly<Record<string, number>>;
    schemaVersion: number;
  }): Promise<PushResult> {
    this.pushCalls++;
    void input;
    void this.maxRetries;
    return { status: 'rejected-stale', freshChanges: [], cursor: { seq: 0 } };
  }
}
