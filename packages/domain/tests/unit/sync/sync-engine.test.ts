import { describe, it, expect } from 'vitest';
import type { SyncHubPort, SyncCursor, ChangeBatch, PushResult, LocalChange } from '../../../src/ports/sync-hub-port';
import type { Clock } from '../../../src/ports/clock';
import { SCHEMA_VERSION } from '../../../src/sync/schema-version';
import type { CenterCode, DeviceId, EntityId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncHub } from '../fakes/in-memory-sync-hub';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { CENTER, DEV_A, DEV_B, DEV_C, S1, S2, S3, S4, S5, USER_A, USER_B, USER_C, makeEngine, matcherFor, studentEntity } from './sync-engine-helpers';

/**
 * The full pull → resolve → push cycle (SOU-80 "done when"): two instances
 * against the same hub converge to identical DB state after any write sequence,
 * including a simultaneous-push race (one accepted, one rejected-stale, both
 * converge). Resolution happens on the second syncer; ordering is decided by
 * version counters, never wall clocks.
 */
describe('SyncEngine — pull → resolve → push', () => {
  it('pushes a local create; the other device pulls and both converge', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    const resultA = await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    expect(resultA.status).toBe('synced');
    expect(resultA.pushed).toBe(1);
    expect(resultA.conflicts).toHaveLength(0);
    expect(hub.canonicalVersion(CENTER, 'students', S1)).toBe(1);

    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(resultB.status).toBe('synced');
    expect(resultB.applied).toBe(1);
    expect(resultB.conflicts).toHaveLength(0);
    expect(a.entity('students', S1)).toEqual(b.entity('students', S1));
  });

  it('auto-merges disjoint field edits made on two devices — silently', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    // Baseline: both devices hold S1 at version 1.
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    // A changes the phone, B changes the level — offline, both from v1.
    a.writeLocal('students', S1, studentEntity(S1, { phone: '0666666666' }), ['phone'], USER_A);
    b.writeLocal('students', S1, studentEntity(S1, { level: '1 Bac' }), ['level'], USER_B);

    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    expect(resultB.status).toBe('synced');
    expect(resultB.conflicts).toHaveLength(0); // disjoint fields → no human involved
    const merged = a.entity('students', S1);
    expect(merged.phone).toBe('0666666666');
    expect(merged.level).toBe('1 Bac');
    expect(a.entity('students', S1)).toEqual(b.entity('students', S1));
  });

  it('same-field clash → conflict, entity blocked, nothing clobbered', async () => {
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
    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(resultB.status).toBe('synced');
    expect(resultB.conflicts).toHaveLength(1);
    const clash = resultB.conflicts[0];
    expect(clash.kind).toBe('field-clash');
    if (clash.kind !== 'field-clash') return;
    expect(clash.fields).toEqual(['phone']);

    // B's edit is preserved (nothing lost) but blocked: it must not be pushed.
    expect(b.isBlocked('students', S1)).toBe(true);
    expect(b.entity('students', S1).phone).toBe('0677777777');
    // The hub kept A's phone — the loser's write never landed.
    expect(hub.canonicalEntity(CENTER, 'students', S1)?.phone).toBe('0666666666');
    expect(hub.canonicalVersion(CENTER, 'students', S1)).toBe(2);
  });

  it('simultaneous push race — one accepted, one rejected-stale, both converge', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    // Baseline: both hold S1 at version 1.
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    // Both edit offline from v1: A the phone, B the level.
    a.writeLocal('students', S1, studentEntity(S1, { phone: '0666666666' }), ['phone'], USER_A);
    b.writeLocal('students', S1, studentEntity(S1, { level: '1 Bac' }), ['level'], USER_B);

    // B syncs through a hub that injects A's push "at the exact same moment" —
    // between B's pull and B's push, so B's push is checked against a stale base.
    const raced = new ConcurrentPushHub(hub, clock);
    const resultB = await makeEngine({ hub: raced, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(raced.pushCalls).toBeGreaterThanOrEqual(2); // first rejected-stale, then accepted
    expect(resultB.status).toBe('synced');
    expect(resultB.conflicts).toHaveLength(0);

    // A now pulls the winning merged state; the last device to sync re-merges
    // its own pending edit and both converge. The other device converges on its
    // next pull (resolution always happens on the device that syncs second).
    const resultA = await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    expect(resultA.status).toBe('synced');
    expect(resultA.conflicts).toHaveLength(0);
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(a.entity('students', S1)).toEqual(b.entity('students', S1));
    expect(b.entity('students', S1).phone).toBe('0666666666');
    expect(b.entity('students', S1).level).toBe('1 Bac');
  });

  it('delete-vs-edit is never auto-resolved (edit wins the race first)', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    a.writeLocalDelete('students', S1, USER_A); // A archives
    b.writeLocal('students', S1, studentEntity(S1, { level: '3AC' }), ['level'], USER_B); // B edits

    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(resultB.conflicts).toHaveLength(1);
    expect(resultB.conflicts[0].kind).toBe('delete-vs-edit');
    if (resultB.conflicts[0].kind !== 'delete-vs-edit') return;
    expect(resultB.conflicts[0].mine.op).toBe('update');
    expect(resultB.conflicts[0].theirs.op).toBe('delete');
    // The tombstone won the version race; B's edit is blocked, never pushed over it.
    expect(hub.canonicalEntity(CENTER, 'students', S1)?.deletedAt).toBeDefined();
    expect(b.isBlocked('students', S1)).toBe(true);
  });

  it('both devices deleting the same record is clean — no conflict', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    a.writeLocalDelete('students', S1, USER_A);
    b.writeLocalDelete('students', S1, USER_B);

    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(resultB.conflicts).toHaveLength(0);
    expect(b.entity('students', S1)?.deletedAt).toBeDefined();
    expect(a.entity('students', S1)).toEqual(b.entity('students', S1));
  });

  it('a laptop offline for two weeks pulls only the delta since its cursor', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    for (const [id, name] of [[S1, 'A'], [S2, 'B']] as const) {
      a.writeLocal('students', id, studentEntity(id, { name: { fr: name, ar: name } }), ['name'], USER_A);
    }
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    for (const id of [S3, S4, S5]) {
      a.writeLocal('students', id, studentEntity(id), ['name'], USER_A);
    }
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    expect(resultB.applied).toBe(3); // S3, S4, S5 — not a re-delivery of everything
    for (const id of [S1, S2, S3, S4, S5]) {
      expect(b.entity('students', id)).toBeDefined();
    }
  });

  it('a fresh install (empty DB, no cursor) pulls from the start — nothing missed', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);

    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    // Brand-new laptop, empty DB, no local cursor.
    const fresh = new InMemorySyncLocalRepository(clock, DEV_B);
    const result = await makeEngine({ hub, local: fresh, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(fresh));

    expect(result.status).toBe('synced');
    expect(result.applied).toBe(1);
    expect(fresh.entity('students', S1)).toBeDefined();
  });

  it('a device that lost its local cursor re-pulls the WHOLE feed, never a delta from its old hub cursor', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    // B syncs S1 once — the hub stores a per-device cursor for B at seq 1.
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    // A pushes more while B is "offline".
    a.writeLocal('students', S2, studentEntity(S2), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    // B's local cursor is lost (fresh local DB). A null cursor must replay from
    // the head — the stored per-device hub cursor is NOT a shortcut to skip it.
    const reset = new InMemorySyncLocalRepository(clock, DEV_B);
    const result = await makeEngine({ hub, local: reset, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(reset));

    expect(result.status).toBe('synced');
    expect(result.applied).toBe(2); // S1 AND S2 — the whole feed, not the delta
    expect(reset.entity('students', S1)).toBeDefined();
    expect(reset.entity('students', S2)).toBeDefined();
  });

  it('duplicate parents detected at sync, parents-first by E.164 phone', async () => {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    const P1 = 'prt_00000000000000000000000001' as EntityId;
    const P2 = 'prt_00000000000000000000000002' as EntityId;
    a.writeLocal('parents', P1, { id: P1, name: 'Mohamed El Amrani', phone: '+212600000001', email: null, relation: 'father', whatsappOptIn: false }, ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    // Laptop A creates the same guardian again (same phone, case-variant name).
    a.writeLocal('parents', P2, { id: P2, name: 'MOHAMED EL AMRANI', phone: '+212600000001', email: null, relation: 'father', whatsappOptIn: false }, ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    const resultB = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b));

    const duplicate = resultB.conflicts.find((c) => c.kind === 'probable-duplicate');
    expect(duplicate).toBeDefined();
    if (!duplicate || duplicate.kind !== 'probable-duplicate') return;
    expect(duplicate.entityType).toBe('parents');
    expect(duplicate.keptId).toBe(P1);
    expect(duplicate.candidateId).toBe(P2);
    expect(duplicate.tier).toBe('exact');
  });
});

/**
 * Injects a competing device's push between the pull and the push of the real
 * device — the "two laptops syncing at 18:00 closing" race, deterministic.
 */
class ConcurrentPushHub implements SyncHubPort {
  pushCalls = 0;
  private injected = false;
  constructor(
    private readonly inner: SyncHubPort,
    private readonly clock: Clock,
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
    if (!this.injected && input.changes.length > 0) {
      this.injected = true;
      await this.inner.pushChanges({
        centreId: input.centreId,
        deviceId: DEV_C,
        schemaVersion: SCHEMA_VERSION,
        changes: [{
          entityType: 'students',
          entityId: S1,
          deviceId: DEV_C,
          baseVersion: 1,
          op: 'update',
          entity: studentEntity(S1, { phone: '0666666666' }),
          changedFields: ['phone'],
          seq: 1,
          at: this.clock.now(),
          updatedBy: USER_C,
        }],
      });
    }
    return this.inner.pushChanges(input);
  }
}
