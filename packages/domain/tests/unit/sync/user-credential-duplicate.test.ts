import { describe, it, expect } from 'vitest';
import { ChangeResolver } from '../../../src/sync/resolve-changes';
import type {
  UserCredentialDuplicate,
  UserCredentialDuplicateStore,
} from '../../../src/sync/user-credential-duplicate';
import { normalizeUsername } from '../../../src/policies/username-normalization';
import type { HubChange } from '../../../src/ports/sync-hub-port';
import type { EntityId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { CENTER, DEV_A, USER_A, USER_B, DEV_B, matcherFor } from './sync-engine-helpers';

/**
 * SOU-258 follow-up — after migration 0053 relaxed the live-username unique
 * index, two laptops that each created the same account offline leave two live
 * `users` rows. The resolve step surfaces that as a `UserCredentialDuplicate`
 * (greatest-ULID winner, matching the repositories' read rule) so the UI can
 * nudge a password reset. Detection only: both rows stay live, nothing is
 * tombstoned, no human popup.
 */

const clock = fakeClock('2026-08-01T10:00:00Z');

const USR_LO = 'usr_00000000000000000000000001' as EntityId;
const USR_HI = 'usr_00000000000000000000000002' as EntityId;

const userEntity = (id: EntityId, over: Record<string, unknown> = {}) => ({
  id,
  role: 'owner',
  username: 'directrice',
  deletedAt: null,
  ...over,
});

/** Fake duplicate store over the in-memory shadow repo (mirrors the SQLite adapter). */
class FakeUserDuplicateStore implements UserCredentialDuplicateStore {
  constructor(private readonly local: InMemorySyncLocalRepository) {}

  findLiveUserIdByUsername(_c: unknown, usernameNormalized: string, excludeId: EntityId): EntityId | null {
    const matches = this.local
      .livePeople<{ id: string; username: string }>('usr_')
      .filter((u) => u.id !== excludeId && normalizeUsername(u.username) === usernameNormalized)
      .map((u) => u.id)
      .sort();
    return matches.length > 0 ? (matches[matches.length - 1] as EntityId) : null;
  }
}

function resolverFor(
  local: InMemorySyncLocalRepository,
  store: UserCredentialDuplicateStore | null,
): ChangeResolver {
  return new ChangeResolver(local, clock, DEV_A, USER_A, CENTER, null, null, null, store);
}

function inboundUser(id: EntityId, over: Partial<HubChange> = {}): HubChange {
  return {
    entityType: 'users',
    entityId: id,
    version: 1,
    seq: 1,
    op: 'create',
    entity: userEntity(id),
    changedFields: [],
    deviceId: DEV_B,
    updatedBy: USER_B,
    deviceSeq: 1,
    receivedAt: new Date('2026-08-01T10:00:00Z'),
    ...over,
  };
}

describe('ChangeResolver — user credential duplicate (SOU-258 follow-up)', () => {
  it('inbound higher ULID over a live local row: surfaces the duplicate, both rows live, winner is the greatest ULID', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('users', USR_LO, userEntity(USR_LO), 1); // this device's own owner

    const duplicates: UserCredentialDuplicate[] = [];
    const applied = resolverFor(local, new FakeUserDuplicateStore(local)).resolveBatch(
      [inboundUser(USR_HI)],
      matcherFor(local),
      { conflicts: [], userCredentialDuplicates: duplicates },
    );

    expect(applied).toBe(1);
    // Both rows coexist — nothing tombstoned.
    expect(local.entity('users', USR_LO)).not.toBeNull();
    expect(local.entity('users', USR_HI)).not.toBeNull();
    expect(duplicates).toEqual([
      { entityType: 'users', username: 'directrice', winnerId: USR_HI, loserId: USR_LO },
    ]);
  });

  it('inbound lower ULID over a live local row: winner is still the greatest ULID (the local row)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('users', USR_HI, userEntity(USR_HI), 1);

    const duplicates: UserCredentialDuplicate[] = [];
    resolverFor(local, new FakeUserDuplicateStore(local)).resolveBatch(
      [inboundUser(USR_LO)],
      matcherFor(local),
      { conflicts: [], userCredentialDuplicates: duplicates },
    );

    expect(duplicates).toEqual([
      { entityType: 'users', username: 'directrice', winnerId: USR_HI, loserId: USR_LO },
    ]);
  });

  it('case-insensitive match: a differently-cased username still collides', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('users', USR_LO, userEntity(USR_LO, { username: 'DIRECTRICE' }), 1);

    const duplicates: UserCredentialDuplicate[] = [];
    resolverFor(local, new FakeUserDuplicateStore(local)).resolveBatch(
      [inboundUser(USR_HI, { entity: userEntity(USR_HI, { username: 'directrice' }) })],
      matcherFor(local),
      { conflicts: [], userCredentialDuplicates: duplicates },
    );

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.username).toBe('directrice');
  });

  it('different usernames do not collide', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('users', USR_LO, userEntity(USR_LO, { username: 'amine' }), 1);

    const duplicates: UserCredentialDuplicate[] = [];
    resolverFor(local, new FakeUserDuplicateStore(local)).resolveBatch(
      [inboundUser(USR_HI)],
      matcherFor(local),
      { conflicts: [], userCredentialDuplicates: duplicates },
    );

    expect(duplicates).toHaveLength(0);
  });

  it('a tombstone apply never surfaces a duplicate (the partial index excludes it)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('users', USR_LO, userEntity(USR_LO), 1);

    const duplicates: UserCredentialDuplicate[] = [];
    resolverFor(local, new FakeUserDuplicateStore(local)).resolveBatch(
      [inboundUser(USR_HI, { op: 'delete', entity: userEntity(USR_HI, { deletedAt: new Date() }) })],
      matcherFor(local),
      { conflicts: [], userCredentialDuplicates: duplicates },
    );

    expect(duplicates).toHaveLength(0);
  });

  it('without a duplicate store, the user applies plainly (no surfacing)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('users', USR_LO, userEntity(USR_LO), 1);

    const duplicates: UserCredentialDuplicate[] = [];
    resolverFor(local, null).resolveBatch([inboundUser(USR_HI)], matcherFor(local), {
      conflicts: [],
      userCredentialDuplicates: duplicates,
    });

    expect(duplicates).toHaveLength(0);
  });

  it('is idempotent across re-delivery — a re-pulled inbound at the same version does not re-surface', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('users', USR_LO, userEntity(USR_LO), 1);

    const duplicates: UserCredentialDuplicate[] = [];
    const resolver = resolverFor(local, new FakeUserDuplicateStore(local));
    resolver.resolveBatch([inboundUser(USR_HI)], matcherFor(local), {
      conflicts: [],
      userCredentialDuplicates: duplicates,
    });
    const appliedAgain = resolver.resolveBatch([inboundUser(USR_HI)], matcherFor(local), {
      conflicts: [],
      userCredentialDuplicates: duplicates,
    });

    expect(appliedAgain).toBe(0); // version skip
    expect(duplicates).toHaveLength(1);
  });
});
