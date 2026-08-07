import { describe, it, expect, beforeEach } from 'vitest';
import { ResolveConflict } from '../../../src/use-cases/resolve-conflict';
import { ConflictNotFoundError, ConflictNotPerFieldResolvableError } from '../../../src/errors/sync-errors';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import type { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { InMemorySyncLocalRepository as InMemorySyncLocalRepo } from '../fakes/in-memory-sync-local-repository';
import { InMemorySyncHub } from '../fakes/in-memory-sync-hub';
import type { InMemorySyncHub as HubType } from '../fakes/in-memory-sync-hub';
import { fakeClock } from '../fakes/clock';
import type { Clock } from '../../../src/ports/clock';
import { CENTER, DEV_A, DEV_B, S1, USER_A, USER_B, makeEngine, matcherFor, studentEntity } from '../sync/sync-engine-helpers';

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
