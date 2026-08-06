import { describe, it, expect } from 'vitest';
import { ChangeResolver } from '../../../src/sync/resolve-changes';
import { ImmutableDivergenceError } from '../../../src/errors/sync-errors';
import type { HubChange } from '../../../src/ports/sync-hub-port';
import type { SyncConflict } from '../../../src/sync/conflicts';
import type { DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { CENTER, DEV_A, DEV_B, S1, USER_A, USER_B, matcherFor, studentEntity } from './sync-engine-helpers';

/**
 * The resolver decides on `version` alone — timestamps are display context,
 * never a merge or skip criterion (SOU-80 §7). A stale-version change is
 * skipped even when its receivedAt is absurdly in the future; a higher-version
 * change wins even when its timestamp is ancient. Immutable-entity divergence
 * blocks the pending write and aborts the sync loudly — no conflict pushed.
 */

const clock = fakeClock('2026-08-01T10:00:00Z');

function resolver(local: InMemorySyncLocalRepository, deviceId: DeviceId, updatedBy: UserId): ChangeResolver {
  return new ChangeResolver(local, clock, deviceId, updatedBy, CENTER);
}

function inboundChange(overrides: Partial<HubChange>): HubChange {
  return {
    entityType: 'students',
    entityId: S1,
    version: 2,
    seq: 1,
    op: 'update',
    entity: studentEntity(S1),
    changedFields: [],
    deviceId: DEV_B,
    updatedBy: USER_B,
    deviceSeq: 1,
    receivedAt: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  };
}

describe('ChangeResolver — version dominates the wall clock', () => {
  it('skips a stale-version change even when its receivedAt is in the future', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('students', S1, studentEntity(S1, { phone: '0666666666' }), 2);

    const conflicts: SyncConflict[] = [];
    const applied = resolver(local, DEV_A, USER_A).resolveBatch(
      [
        inboundChange({
          version: 1, // already superseded by the applied v2
          receivedAt: new Date('2030-01-01T00:00:00Z'), // device clock absurdly ahead
          changedFields: ['level'],
          entity: studentEntity(S1, { level: '3AC' }),
        }),
      ],
      conflicts,
      matcherFor(local),
    );

    expect(applied).toBe(0);
    expect(conflicts).toHaveLength(0);
    // The applied higher-version state is untouched — the future stamp lost.
    expect(local.entity('students', S1)?.phone).toBe('0666666666');
    expect(local.entity('students', S1)?.level).toBe('2 Bac');
  });

  it('applies a higher-version change even when its receivedAt is ancient', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('students', S1, studentEntity(S1), 1);

    const conflicts: SyncConflict[] = [];
    const applied = resolver(local, DEV_A, USER_A).resolveBatch(
      [
        inboundChange({
          version: 3, // newer canonical version
          receivedAt: new Date('2020-01-01T00:00:00Z'), // timestamp older than the local state
          changedFields: ['level'],
          entity: studentEntity(S1, { level: '3AC' }),
        }),
      ],
      conflicts,
      matcherFor(local),
    );

    expect(applied).toBe(1);
    expect(local.entity('students', S1)?.level).toBe('3AC');
  });
});

describe('ChangeResolver — immutable-entity divergence aborts the sync', () => {
  const INVOICE = 'inv_00000000000000000000000001' as EntityId;

  it('blocks the pending write and throws ImmutableDivergenceError, pushing no conflict', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('invoices', INVOICE, { id: INVOICE, month: '2026-08', amount: 350, status: 'draft' }, 1);
    local.writeLocal('invoices', INVOICE, { id: INVOICE, month: '2026-08', amount: 300, status: 'draft' }, ['amount'], USER_A);

    const conflicts: SyncConflict[] = [];
    const resolve = () =>
      resolver(local, DEV_A, USER_A).resolveBatch(
        [
          {
            entityType: 'invoices',
            entityId: INVOICE,
            version: 2,
            seq: 1,
            op: 'update',
            entity: { id: INVOICE, month: '2026-08', amount: 400, status: 'draft' },
            changedFields: ['amount'],
            deviceId: DEV_B,
            updatedBy: USER_B,
            deviceSeq: 1,
            receivedAt: new Date('2026-08-01T10:00:00Z'),
          },
        ],
        conflicts,
        matcherFor(local),
      );

    expect(resolve).toThrow(ImmutableDivergenceError);
    expect(local.isBlocked('invoices', INVOICE)).toBe(true);
    expect(conflicts).toHaveLength(0);
  });
});
