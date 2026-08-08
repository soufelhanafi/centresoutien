import { describe, it, expect } from 'vitest';
import { ChangeResolver } from '../../../src/sync/resolve-changes';
import type { SubjectCodeCollision, SubjectCodeCollisionStore } from '../../../src/sync/subject-code-collision';
import type { SyncConflict } from '../../../src/sync/conflicts';
import type { HubChange } from '../../../src/ports/sync-hub-port';
import type { EntityId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import { CENTER, DEV_A, USER_A, USER_B, DEV_B, matcherFor } from './sync-engine-helpers';

/**
 * SOU-122 — a subject apply whose `code` clashes with a different live local
 * subject must auto-resolve (lower ULID keeps the code, the loser's code is
 * nulled) instead of throwing the projected `ux_subjects_code` constraint. Both
 * rows survive; the clash surfaces on the resolve path as a `SubjectCodeCollision`.
 */

const clock = fakeClock('2026-08-01T10:00:00Z');

const SUB_LO = 'sub_00000000000000000000000001' as EntityId;
const SUB_HI = 'sub_00000000000000000000000002' as EntityId;

const subjectEntity = (id: EntityId, over: Record<string, unknown> = {}) => ({
  id,
  name: { fr: 'Maths', ar: 'رياضيات' },
  code: 'MATH',
  active: true,
  ...over,
});

/** Fake collision store over the in-memory shadow repo (mirrors the SQLite adapter). */
class FakeSubjectCodeStore implements SubjectCodeCollisionStore {
  constructor(private readonly local: InMemorySyncLocalRepository) {}

  findLiveSubjectIdByCode(_c: unknown, code: string, excludeId: EntityId): EntityId | null {
    for (const s of this.local.livePeople<{ id: string; code: string | null }>('sub_')) {
      if (s.id !== excludeId && s.code === code) return s.id as EntityId;
    }
    return null;
  }

  clearSubjectCode(entityId: EntityId): void {
    const state = this.local.getLocalState('subjects', entityId);
    if (!state) return;
    this.local.applyInbound('subjects', entityId, { ...state.entity, code: null }, state.version);
  }
}

function resolverFor(local: InMemorySyncLocalRepository, store: SubjectCodeCollisionStore | null): ChangeResolver {
  return new ChangeResolver(local, clock, DEV_A, USER_A, CENTER, store);
}

function inboundSubject(id: EntityId, over: Partial<HubChange> = {}): HubChange {
  return {
    entityType: 'subjects',
    entityId: id,
    version: 1,
    seq: 1,
    op: 'create',
    entity: subjectEntity(id),
    changedFields: [],
    deviceId: DEV_B,
    updatedBy: USER_B,
    deviceSeq: 1,
    receivedAt: new Date('2026-08-01T10:00:00Z'),
    ...over,
  };
}

describe('ChangeResolver — subject code collision (SOU-122)', () => {
  it('inbound is the lower ULID: it keeps the code, the local loser is nulled', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('subjects', SUB_HI, subjectEntity(SUB_HI), 1); // pre-existing local MATH

    const conflicts: SyncConflict[] = [];
    const collisions: SubjectCodeCollision[] = [];
    const applied = resolverFor(local, new FakeSubjectCodeStore(local)).resolveBatch(
      [inboundSubject(SUB_LO)],
      conflicts,
      matcherFor(local),
      collisions,
    );

    expect(applied).toBe(1);
    expect(conflicts).toHaveLength(0);
    expect(local.entity('subjects', SUB_LO)?.code).toBe('MATH'); // winner keeps it
    expect(local.entity('subjects', SUB_HI)?.code).toBeNull(); // loser freed
    expect(collisions).toEqual([
      { entityType: 'subjects', code: 'MATH', winnerId: SUB_LO, loserId: SUB_HI },
    ]);
  });

  it('inbound is the higher ULID: it is applied with a nulled code, local winner untouched', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('subjects', SUB_LO, subjectEntity(SUB_LO), 1); // pre-existing local MATH

    const collisions: SubjectCodeCollision[] = [];
    const applied = resolverFor(local, new FakeSubjectCodeStore(local)).resolveBatch(
      [inboundSubject(SUB_HI)],
      [],
      matcherFor(local),
      collisions,
    );

    expect(applied).toBe(1);
    expect(local.entity('subjects', SUB_LO)?.code).toBe('MATH'); // winner untouched
    expect(local.entity('subjects', SUB_HI)?.code).toBeNull(); // inbound loser nulled
    expect(collisions).toEqual([
      { entityType: 'subjects', code: 'MATH', winnerId: SUB_LO, loserId: SUB_HI },
    ]);
  });

  it('different codes do not collide', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('subjects', SUB_LO, subjectEntity(SUB_LO, { code: 'PC' }), 1);

    const collisions: SubjectCodeCollision[] = [];
    resolverFor(local, new FakeSubjectCodeStore(local)).resolveBatch(
      [inboundSubject(SUB_HI)],
      [],
      matcherFor(local),
      collisions,
    );

    expect(local.entity('subjects', SUB_HI)?.code).toBe('MATH');
    expect(collisions).toHaveLength(0);
  });

  it('a tombstone apply skips collision handling (the partial index excludes it)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('subjects', SUB_LO, subjectEntity(SUB_LO), 1);

    const collisions: SubjectCodeCollision[] = [];
    resolverFor(local, new FakeSubjectCodeStore(local)).resolveBatch(
      [inboundSubject(SUB_HI, { op: 'delete', entity: subjectEntity(SUB_HI, { deletedAt: new Date() }) })],
      [],
      matcherFor(local),
      collisions,
    );

    expect(local.entity('subjects', SUB_LO)?.code).toBe('MATH'); // winner untouched, no null
    expect(collisions).toHaveLength(0);
  });

  it('without a collision store, the subject applies plainly (no surfacing)', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('subjects', SUB_LO, subjectEntity(SUB_LO), 1);

    const collisions: SubjectCodeCollision[] = [];
    resolverFor(local, null).resolveBatch([inboundSubject(SUB_HI)], [], matcherFor(local), collisions);

    expect(local.entity('subjects', SUB_HI)?.code).toBe('MATH');
    expect(collisions).toHaveLength(0);
  });

  it('is idempotent across re-delivery — a re-pulled inbound at the same version does not re-surface', () => {
    const local = new InMemorySyncLocalRepository(clock, DEV_A);
    local.applyInbound('subjects', SUB_HI, subjectEntity(SUB_HI), 1);

    const collisions: SubjectCodeCollision[] = [];
    const resolver = resolverFor(local, new FakeSubjectCodeStore(local));
    resolver.resolveBatch([inboundSubject(SUB_LO)], [], matcherFor(local), collisions);
    const appliedAgain = resolver.resolveBatch([inboundSubject(SUB_LO)], [], matcherFor(local), collisions);

    expect(appliedAgain).toBe(0); // version skip
    expect(collisions).toHaveLength(1);
    expect(local.entity('subjects', SUB_HI)?.code).toBeNull();
  });
});
