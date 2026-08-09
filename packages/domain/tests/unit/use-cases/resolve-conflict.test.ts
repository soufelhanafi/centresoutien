import { describe, it, expect, beforeEach } from 'vitest';
import { ResolveConflict } from '../../../src/use-cases/resolve-conflict';
import { ConflictNotFoundError, ConflictNotPerFieldResolvableError } from '../../../src/errors/sync-errors';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import type { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { InMemorySyncLocalRepository as InMemorySyncLocalRepo } from '../fakes/in-memory-sync-local-repository';
import { InMemorySyncHub } from '../fakes/in-memory-sync-hub';
import type { InMemorySyncHub as HubType } from '../fakes/in-memory-sync-hub';
import { InMemorySessionDedupStore } from '../fakes/in-memory-session-dedup-store';
import { fakeClock } from '../fakes/clock';
import type { Clock } from '../../../src/ports/clock';
import { CENTER, DEV_A, DEV_B, S1, USER_A, USER_B, makeEngine, matcherFor, studentEntity } from '../sync/sync-engine-helpers';
import type { EntityId } from '../../../src/value-objects/ids';

/**
 * `ResolveConflict` settles a clash a human already decided on. The engine
 * surfaces it; this use case produces the fresh pending write that wins
 * deterministically on every device's next pull — never by wall clock. The
 * scenarios below drive a real engine to field-clash, then resolve each way.
 */
describe('ResolveConflict', () => {
  let clock: Clock;
  let local: InMemorySyncLocalRepository;
  let plan: PlanPolicy;

  beforeEach(() => {
    clock = fakeClock('2026-08-01T10:00:00Z');
    local = new InMemorySyncLocalRepo(clock, DEV_B);
    plan = new PlanPolicy(PLANS.premium);
  });

  const useCase = () => new ResolveConflict(local, clock, plan);

  type Resolution =
    | { choice: 'take-mine' }
    | { choice: 'take-theirs' }
    | { choice: 'per-field'; fields: Record<string, 'mine' | 'theirs'> };

  const resolve = (entityId: string, resolution: Resolution) =>
    useCase().execute({
      entityType: 'students',
      entityId: entityId as never,
      deviceId: DEV_B,
      updatedBy: USER_B,
      resolution,
    });

  const pendingFor = (entityId: string) => local.listPending().find((p) => p.entityId === entityId);

  /** A and B both edit `phone` from the same base; B syncs second and clashes. */
  async function fieldClashOnB(): Promise<{ hub: HubType; a: InMemorySyncLocalRepository }> {
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepo(clock, DEV_A);
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(local));

    a.writeLocal('students', S1, studentEntity(S1, { phone: '0666666666' }), ['phone'], USER_A);
    local.writeLocal('students', S1, studentEntity(S1, { phone: '0777777777' }), ['phone'], USER_B);

    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    const resultB = await makeEngine({ hub, local, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(local));
    expect(resultB.conflicts).toHaveLength(1);
    expect(resultB.conflicts[0].kind).toBe('field-clash');
    return { hub, a };
  }

  /** B archives while A edits; B's delete is blocked by a delete-vs-edit. */
  async function deleteVsEditOnB(): Promise<void> {
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepo(clock, DEV_A);
    a.writeLocal('students', S1, studentEntity(S1), ['name'], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    await makeEngine({ hub, local, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(local));

    a.writeLocal('students', S1, studentEntity(S1, { level: '3AC' }), ['level'], USER_A); // A edits first
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    local.writeLocalDelete('students', S1, USER_B); // then B archives
    await makeEngine({ hub, local, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(local));
  }

  it('is gated by sync.conflict-resolution', async () => {
    await fieldClashOnB();
    const locked = new PlanPolicy({
      ...PLANS.premium,
      features: new Set([...PLANS.premium.features].filter((f) => f !== 'sync.conflict-resolution')),
    });
    await expect(
      new ResolveConflict(local, clock, locked).execute({
        entityType: 'students',
        entityId: S1,
        deviceId: DEV_B,
        updatedBy: USER_B,
        resolution: { choice: 'take-mine' },
      }),
    ).rejects.toThrow('not available on the');
  });

  it('take-mine keeps the local value, clears the block, and re-bases onto the canonical version', async () => {
    await fieldClashOnB();
    expect(local.isBlocked('students', S1)).toBe(true);

    await resolve(S1, { choice: 'take-mine' });

    expect(local.isBlocked('students', S1)).toBe(false);
    expect(local.listBlocked()).toHaveLength(0);
    const pending = pendingFor(S1);
    expect(pending?.entity['phone']).toBe('0777777777');
    expect(pending?.baseVersion).toBeGreaterThan(0);
  });

  it('take-theirs adopts the other side and clears the block', async () => {
    await fieldClashOnB();

    await resolve(S1, { choice: 'take-theirs' });

    expect(local.isBlocked('students', S1)).toBe(false);
    const pending = pendingFor(S1);
    expect(pending?.entity['phone']).toBe('0666666666');
  });

  it('per-field picks a winner per clashing field', async () => {
    await fieldClashOnB();

    await resolve(S1, { choice: 'per-field', fields: { phone: 'theirs' } });

    const pending = pendingFor(S1);
    expect(pending?.entity['phone']).toBe('0666666666');
  });

  it('resolving produces a new pending write that wins on the other device on its next pull', async () => {
    const { hub, a } = await fieldClashOnB();

    await resolve(S1, { choice: 'take-mine' });
    // B pushes the resolution; the hub accepts (fresh version) and A converges.
    const resultB = await makeEngine({ hub, local, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(local));
    expect(resultB.status).toBe('synced');
    expect(resultB.conflicts).toHaveLength(0);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    expect(a.entity('students', S1)?.phone).toBe('0777777777');
    expect(hub.canonicalEntity(CENTER, 'students', S1)?.phone).toBe('0777777777');
  });

  it('delete-vs-edit: take-mine keeps the local delete, re-based', async () => {
    await deleteVsEditOnB();
    expect(local.listBlocked().find((c) => c.kind === 'delete-vs-edit')).toBeDefined();

    await resolve(S1, { choice: 'take-mine' });

    expect(local.isBlocked('students', S1)).toBe(false);
    expect(pendingFor(S1)?.op).toBe('delete');
  });

  it('delete-vs-edit: take-theirs adopts the edit', async () => {
    await deleteVsEditOnB();

    await resolve(S1, { choice: 'take-theirs' });

    expect(local.isBlocked('students', S1)).toBe(false);
    const pending = pendingFor(S1);
    expect(pending?.op).toBe('update');
    expect(pending?.entity['level']).toBe('3AC');
  });

  it('delete-vs-edit rejects per-field resolution', async () => {
    await deleteVsEditOnB();
    await expect(resolve(S1, { choice: 'per-field', fields: { level: 'theirs' } })).rejects.toBeInstanceOf(
      ConflictNotPerFieldResolvableError,
    );
  });

  it('throws ConflictNotFoundError when the conflict was already resolved', async () => {
    await fieldClashOnB();
    await resolve(S1, { choice: 'take-mine' });
    await expect(resolve(S1, { choice: 'take-theirs' })).rejects.toBeInstanceOf(ConflictNotFoundError);
  });
});

/**
 * SOU-194 — resolving a session natural-key conflict (delete-vs-edit /
 * field-clash, keyed on the local occupied row) must be natural-key-aware:
 * the human's choice survives under the lower-ULID WINNER id with the loser
 * retired, so `take-theirs` can never re-wedge `ux_sessions_recurrence_date`
 * at the next `markSynced` projection and `take-mine` never leaves the winner
 * silently un-applied (the cursor consumed it). Real engine → conflict →
 * resolve → sync, in memory.
 */
describe('ResolveConflict — session natural-key (SOU-194)', () => {
  let clock: Clock;
  let b: InMemorySyncLocalRepository;

  beforeEach(() => {
    clock = fakeClock('2026-08-01T10:00:00Z');
    b = new InMemorySyncLocalRepo(clock, DEV_B);
  });

  const SES_LO = 'ses_00000000000000000000000001' as EntityId; // lower ULID
  const SES_HI = 'ses_00000000000000000000000002' as EntityId; // higher ULID
  const WRS = 'wrs_00000000000000000000000001';

  const sessionEntity = (id: EntityId, over: Record<string, unknown> = {}) => ({
    id,
    recurringSessionId: WRS,
    generationBatchId: null,
    roomId: 'rom_00000000000000000000000001',
    teacherId: null,
    groupId: 'grp_00000000000000000000000001',
    date: '2026-09-05',
    start: '09:00',
    end: '10:30',
    deletedAt: null,
    ...over,
  });

  const dedupStore = (local: InMemorySyncLocalRepository) =>
    new InMemorySessionDedupStore(local, clock, DEV_B);

  const resolve = (entityId: EntityId, resolution: { choice: 'take-mine' | 'take-theirs' } | { choice: 'per-field'; fields: Record<string, 'mine' | 'theirs'> }) =>
    new ResolveConflict(b, clock, new PlanPolicy(PLANS.premium), dedupStore(b)).execute({
      entityType: 'sessions',
      entityId,
      deviceId: DEV_B,
      updatedBy: USER_B,
      resolution,
    });

  const pendingFor = (entityId: EntityId) => b.listPending().find((p) => p.entityId === entityId);

  /** A deletes the lower-ULID winner, B holds the higher-ULID loser live: B blocks on a delete-vs-edit keyed on its own row. */
  async function deleteVsEditWhereBIsLoser(): Promise<HubType> {
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepo(clock, DEV_A);
    a.writeLocal('sessions', SES_LO, sessionEntity(SES_LO), [], USER_A);
    a.writeLocalDelete('sessions', SES_LO, USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    b.writeLocal('sessions', SES_HI, sessionEntity(SES_HI), [], USER_B);
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B, sessionDedupStore: dedupStore(b) }).run(
      matcherFor(b),
    );
    const conflict = b.listBlocked()[0];
    expect(conflict?.kind).toBe('delete-vs-edit');
    expect(conflict?.entityId).toBe(SES_HI);
    return hub;
  }

  it('take-theirs on a delete-vs-edit writes the winner id, clears the loser block, and the push is accepted — no wedge', async () => {
    const hub = await deleteVsEditWhereBIsLoser();

    await resolve(SES_HI, { choice: 'take-theirs' });

    expect(b.listBlocked()).toHaveLength(0);
    expect(b.isBlocked('sessions', SES_HI)).toBe(false);
    const pending = pendingFor(SES_LO);
    expect(pending?.op).toBe('delete');
    expect(pending?.entity['id']).toBe(SES_LO);
    expect(pending?.baseVersion).toBeGreaterThan(0);
    // No pending under the loser — the retired row cannot resurrect.
    expect(pendingFor(SES_HI)).toBeUndefined();

    const result = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B, sessionDedupStore: dedupStore(b) }).run(
      matcherFor(b),
    );
    expect(result.status).toBe('synced');
    expect(result.conflicts).toHaveLength(0);
  });

  it('take-mine on a delete-vs-edit keeps the local choice under the winner id — the survivor is live', async () => {
    const hub = await deleteVsEditWhereBIsLoser();

    await resolve(SES_HI, { choice: 'take-mine' });

    const pending = pendingFor(SES_LO);
    expect(pending?.entity['id']).toBe(SES_LO);
    expect(pending?.entity['deletedAt']).toBeNull();
    expect(b.isBlocked('sessions', SES_HI)).toBe(false);

    const result = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B, sessionDedupStore: dedupStore(b) }).run(
      matcherFor(b),
    );
    expect(result.status).toBe('synced');
  });

  it('take-mine when the LOCAL row is the winner re-bases onto its own canonical version, not the inbound\'s', async () => {
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepo(clock, DEV_A);
    a.writeLocal('sessions', SES_HI, sessionEntity(SES_HI), [], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    b.writeLocal('sessions', SES_LO, sessionEntity(SES_LO), [], USER_B);
    b.writeLocalDelete('sessions', SES_LO, USER_B);
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B, sessionDedupStore: dedupStore(b) }).run(
      matcherFor(b),
    );
    expect(b.listBlocked()[0]?.kind).toBe('delete-vs-edit');
    expect(b.listBlocked()[0]?.entityId).toBe(SES_LO);

    await resolve(SES_LO, { choice: 'take-mine' });

    const pending = pendingFor(SES_LO);
    // Local-only winner never pushed → base 0; the inbound's version is NOT used.
    expect(pending?.baseVersion).toBe(0);
    expect(pending?.op).toBe('delete');

    const result = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B, sessionDedupStore: dedupStore(b) }).run(
      matcherFor(b),
    );
    expect(result.status).toBe('synced');
  });

  it('field-clash per-field resolution survives under the winner id', async () => {
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepo(clock, DEV_A);
    a.writeLocal('sessions', SES_LO, sessionEntity(SES_LO), [], USER_A);
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));

    b.writeLocal('sessions', SES_HI, sessionEntity(SES_HI), [], USER_B);
    b.writeLocal('sessions', SES_HI, sessionEntity(SES_HI, { roomId: 'rom_EDITED' }), ['roomId'], USER_B);
    await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B, sessionDedupStore: dedupStore(b) }).run(
      matcherFor(b),
    );
    const conflict = b.listBlocked()[0];
    expect(conflict?.kind).toBe('field-clash');
    expect(conflict?.entityId).toBe(SES_HI);

    await resolve(SES_HI, { choice: 'per-field', fields: { roomId: 'theirs' } });

    const pending = pendingFor(SES_LO);
    expect(pending?.entity['id']).toBe(SES_LO);
    expect(pending?.entity['roomId']).toBe('rom_00000000000000000000000001');
    expect(b.isBlocked('sessions', SES_HI)).toBe(false);
    expect(pendingFor(SES_HI)).toBeUndefined();
  });
});
