import { describe, it, expect } from 'vitest';
import { ChangeResolver } from '../../../src/sync/resolve-changes';
import type { SessionDedup, SessionDedupStore } from '../../../src/sync/session-dedup';
import type { SyncConflict, ConflictSide } from '../../../src/sync/conflicts';
import type { HubChange } from '../../../src/ports/sync-hub-port';
import type { EntityId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { CENTER, DEV_A, USER_A, USER_B, DEV_B, matcherFor } from './sync-engine-helpers';

/**
 * SOU-188 — two replicas materialized the same session occurrence offline
 * (deterministic generator → identical `(recurringSessionId, date)`, different
 * ULIDs). A session apply whose natural key collides with a different local
 * session must:
 *  - settle deterministically (lower ULID wins, in-place rewrite) when BOTH
 *    sides agree on deleted state AND the local copy has no unsynced edit;
 *  - route to a delete-vs-edit / field-clash conflict when they disagree or the
 *    local copy was edited — never throwing `ux_sessions_recurrence_date`
 *    (which would wedge the whole sync) and never silently clobbering the user.
 */

const clock = fakeClock('2026-08-01T10:00:00Z');

const SES_LO = 'ses_00000000000000000000000001' as EntityId;
const SES_HI = 'ses_00000000000000000000000002' as EntityId;
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
  ...over,
});

/** Fake collision store over the in-memory shadow repo (mirrors the SQLite adapter). */
class FakeSessionDedupStore implements SessionDedupStore {
  constructor(private readonly local: InMemorySyncLocalRepository) {}

  findSessionByNaturalKey(
    recurringSessionId: string,
    date: string,
    excludeId: EntityId,
  ): { id: EntityId; deletedAt: string | null } | null {
    for (const entity of Object.values(this.local.allEntities())) {
      const id = entity['id'];
      if (
        String(id ?? '').startsWith('ses_') &&
        id !== excludeId &&
        entity['recurringSessionId'] === recurringSessionId &&
        entity['date'] === date
      ) {
        return { id: id as EntityId, deletedAt: entity['deletedAt'] == null ? null : String(entity['deletedAt']) };
      }
    }
    return null;
  }

  lastLocalSide(entityId: EntityId): ConflictSide | null {
    const state = this.local.getLocalState('sessions', entityId);
    if (!state) return null;
    return {
      updatedBy: state.entity['updatedBy'] as UserId,
      deviceId: DEV_A,
      op: state.entity['deletedAt'] == null ? 'update' : 'delete',
      seq: 0,
      at: clock.now(),
      changedFields: [],
      entity: state.entity,
    };
  }

  absorbSessionAsWinner(input: {
    fromId: EntityId;
    toId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void {
    // The physical in-place rewrite + attendance re-point is the SQLite
    // adapter's job; the in-memory fake has no unique-index constraint, so
    // recording the winner as applied is a faithful stand-in for the outcome.
    this.local.applyInbound('sessions', input.toId, input.entity, input.version);
  }

  retireInboundSession(input: {
    keptId: EntityId;
    retiredId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void {
    this.local.applyInbound('sessions', input.retiredId, input.entity, input.version);
  }
}

function resolverFor(local: InMemorySyncLocalRepository, store: SessionDedupStore | null): ChangeResolver {
  return new ChangeResolver(local, clock, DEV_A, USER_A, CENTER, null, store);
}

function inboundSession(id: EntityId, over: Partial<HubChange> = {}): HubChange {
  return {
    entityType: 'sessions',
    entityId: id,
    version: 1,
    seq: 1,
    op: 'create',
    entity: sessionEntity(id),
    changedFields: [],
    deviceId: DEV_B,
    updatedBy: USER_B,
    deviceSeq: 1,
    receivedAt: new Date('2026-08-01T10:00:00Z'),
    ...over,
  };
}

describe('ChangeResolver — session natural-key collision (SOU-188)', () => {
  it('inbound is the lower ULID: it absorbs the local loser (winner wins)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('sessions', SES_HI, sessionEntity(SES_HI), 1); // pre-existing local occurrence

    const conflicts: SyncConflict[] = [];
    const dedups: SessionDedup[] = [];
    const applied = resolverFor(local, new FakeSessionDedupStore(local)).resolveBatch(
      [inboundSession(SES_LO)],
      conflicts,
      matcherFor(local),
      [],
      dedups,
    );

    expect(applied).toBe(1);
    expect(conflicts).toHaveLength(0);
    // The winner (lower ULID) is what survives everywhere.
    expect(local.entity('sessions', SES_LO)).toEqual(sessionEntity(SES_LO));
    expect(dedups).toEqual([
      { entityType: 'sessions', recurringSessionId: WRS, date: '2026-09-05', winnerId: SES_LO, loserId: SES_HI },
    ]);
  });

  it('inbound is the higher ULID: the local winner is kept, the inbound loser is retired', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('sessions', SES_LO, sessionEntity(SES_LO), 1); // pre-existing local occurrence

    const dedups: SessionDedup[] = [];
    const applied = resolverFor(local, new FakeSessionDedupStore(local)).resolveBatch(
      [inboundSession(SES_HI)],
      [],
      matcherFor(local),
      [],
      dedups,
    );

    expect(applied).toBe(1);
    // Local winner untouched; the inbound loser is recorded (shadow) not wedged.
    expect(local.entity('sessions', SES_LO)).toEqual(sessionEntity(SES_LO));
    expect(local.entity('sessions', SES_HI)).toEqual(sessionEntity(SES_HI));
    expect(dedups).toEqual([
      { entityType: 'sessions', recurringSessionId: WRS, date: '2026-09-05', winnerId: SES_LO, loserId: SES_HI },
    ]);
  });

  it('different natural keys do not collide', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('sessions', SES_LO, sessionEntity(SES_LO, { date: '2026-09-01' }), 1);

    const dedups: SessionDedup[] = [];
    resolverFor(local, new FakeSessionDedupStore(local)).resolveBatch(
      [inboundSession(SES_HI)],
      [],
      matcherFor(local),
      [],
      dedups,
    );

    expect(local.entity('sessions', SES_HI)).toEqual(sessionEntity(SES_HI));
    expect(dedups).toHaveLength(0);
  });

  it('an inbound tombstone vs a live local occurrence is a delete-vs-edit conflict, never a wedge', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('sessions', SES_LO, sessionEntity(SES_LO), 1); // live synced local

    const conflicts: SyncConflict[] = [];
    const dedups: SessionDedup[] = [];
    resolverFor(local, new FakeSessionDedupStore(local)).resolveBatch(
      [
        inboundSession(SES_HI, {
          op: 'delete',
          entity: sessionEntity(SES_HI, { deletedAt: new Date('2026-08-02T00:00:00Z') }),
        }),
      ],
      conflicts,
      matcherFor(local),
      [],
      dedups,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('delete-vs-edit');
    expect((conflicts[0] as Extract<SyncConflict, { kind: 'delete-vs-edit' }>).entityId).toBe(SES_LO);
    // The live local row is untouched — the cancel did not silently win.
    expect(local.entity('sessions', SES_LO)).toEqual(sessionEntity(SES_LO));
    expect(dedups).toHaveLength(0);
  });

  it('a live inbound vs a tombstoned local occurrence is a delete-vs-edit conflict, never a wedge', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound(
      'sessions',
      SES_LO,
      sessionEntity(SES_LO, { deletedAt: new Date('2026-08-02T00:00:00Z') }),
      1, // tombstoned synced local
    );

    const conflicts: SyncConflict[] = [];
    resolverFor(local, new FakeSessionDedupStore(local)).resolveBatch(
      [inboundSession(SES_HI)],
      conflicts,
      matcherFor(local),
      [],
      [],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('delete-vs-edit');
  });

  it('an unsynced local edit on the loser is a field-clash — absorb must not clobber it', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    // Local higher-ULID session was edited offline (room moved) — a pending write.
    local.writeLocal('sessions', SES_HI, sessionEntity(SES_HI, { roomId: 'rom_EDITED' }), ['roomId'], USER_A);

    const conflicts: SyncConflict[] = [];
    const dedups: SessionDedup[] = [];
    resolverFor(local, new FakeSessionDedupStore(local)).resolveBatch(
      [inboundSession(SES_LO)],
      conflicts,
      matcherFor(local),
      [],
      dedups,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('field-clash');
    // The user's edit survives; the loser is blocked, not rewritten.
    expect(local.entity('sessions', SES_HI)?.roomId).toBe('rom_EDITED');
    expect(local.isBlocked('sessions', SES_HI)).toBe(true);
    expect(dedups).toHaveLength(0);
  });

  it('two tombstones of the same occurrence converge deterministically (agreement)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('sessions', SES_HI, sessionEntity(SES_HI, { deletedAt: new Date('2026-08-02T00:00:00Z') }), 1);

    const dedups: SessionDedup[] = [];
    const applied = resolverFor(local, new FakeSessionDedupStore(local)).resolveBatch(
      [
        inboundSession(SES_LO, {
          op: 'delete',
          entity: sessionEntity(SES_LO, { deletedAt: new Date('2026-08-02T00:00:00Z') }),
        }),
      ],
      [],
      matcherFor(local),
      [],
      dedups,
    );

    expect(applied).toBe(1);
    expect(dedups).toHaveLength(1);
  });

  it('without a dedup store, the session applies plainly (no surfacing)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('sessions', SES_LO, sessionEntity(SES_LO), 1);

    const dedups: SessionDedup[] = [];
    resolverFor(local, null).resolveBatch([inboundSession(SES_HI)], [], matcherFor(local), [], dedups);

    expect(local.entity('sessions', SES_HI)).toEqual(sessionEntity(SES_HI));
    expect(dedups).toHaveLength(0);
  });

  it('is idempotent across re-delivery — a re-pulled inbound at the same version does not re-surface', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('sessions', SES_HI, sessionEntity(SES_HI), 1);

    const dedups: SessionDedup[] = [];
    const resolver = resolverFor(local, new FakeSessionDedupStore(local));
    resolver.resolveBatch([inboundSession(SES_LO)], [], matcherFor(local), [], dedups);
    const appliedAgain = resolver.resolveBatch([inboundSession(SES_LO)], [], matcherFor(local), [], dedups);

    expect(appliedAgain).toBe(0); // version skip
    expect(dedups).toHaveLength(1);
  });
});
