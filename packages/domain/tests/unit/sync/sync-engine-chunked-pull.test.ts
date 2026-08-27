import { describe, it, expect } from 'vitest';
import type { SyncProgress } from '../../../src/sync/sync-engine';
import { fakeClock } from '../fakes/clock';
import { InMemorySyncHub } from '../fakes/in-memory-sync-hub';
import { InMemorySyncLocalRepository } from '../fakes/in-memory-sync-local-repository';
import type { EntityId } from '../../../src/value-objects/ids';
import { CENTER, DEV_A, DEV_B, USER_A, USER_B, makeEngine, matcherFor, studentEntity } from './sync-engine-helpers';

/**
 * Chunked, resumable pull (SOU-330). A first sync of a large center streams in
 * bounded chunks instead of one unbounded response: progress is reported per
 * chunk, a human can pause between chunks, and the persisted cursor lets the
 * next run resume exactly where the last stopped — with no lost or duplicated
 * rows, because applies are idempotent via the resolver's version skip.
 */
describe('SyncEngine — chunked pull', () => {
  const studentId = (n: number): EntityId =>
    (`stu_${n.toString().padStart(26, '0')}`) as EntityId;

  /** Seed the hub with `count` students pushed from device A. */
  async function seedHub(count: number): Promise<{ hub: InMemorySyncHub; clock: ReturnType<typeof fakeClock> }> {
    const clock = fakeClock('2026-08-01T10:00:00Z');
    const hub = new InMemorySyncHub(clock);
    const a = new InMemorySyncLocalRepository(clock, DEV_A);
    for (let i = 1; i <= count; i += 1) {
      const id = studentId(i);
      a.writeLocal('students', id, studentEntity(id), ['name'], USER_A);
    }
    await makeEngine({ hub, local: a, clock, deviceId: DEV_A, updatedBy: USER_A }).run(matcherFor(a));
    expect(hub.feed(CENTER)).toHaveLength(count);
    return { hub, clock };
  }

  it('pulls a large feed in bounded chunks and still applies everything', async () => {
    const { hub, clock } = await seedHub(1200);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    const progress: SyncProgress[] = [];
    const result = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b), {
      pullLimit: 500,
      onProgress: (p) => progress.push(p),
    });

    expect(result.status).toBe('synced');
    expect(result.applied).toBe(1200);
    // 1200 rows at 500/chunk → three chunks (500, 500, 200).
    expect(progress).toEqual([
      { pulled: 500, total: 1200 },
      { pulled: 1000, total: 1200 },
      { pulled: 1200, total: 1200 },
    ]);
    expect(b.entity('students', studentId(1))).toBeDefined();
    expect(b.entity('students', studentId(1200))).toBeDefined();
  });

  it('pauses between chunks and resumes from the persisted cursor', async () => {
    const { hub, clock } = await seedHub(1200);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    // Stop after the first chunk lands.
    const firstRun = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b), {
      pullLimit: 500,
      shouldStop: () => true,
    });

    expect(firstRun.status).toBe('paused');
    expect(firstRun.applied).toBe(500);
    expect(b.getCursor()).toEqual({ seq: 500 });
    expect(b.entity('students', studentId(600))).toBeNull(); // not yet pulled

    // Resume: continues from seq 500, no re-download of the first 500.
    const progress: SyncProgress[] = [];
    const resumed = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b), {
      pullLimit: 500,
      onProgress: (p) => progress.push(p),
    });

    expect(resumed.status).toBe('synced');
    expect(resumed.applied).toBe(700); // the remaining 700 only
    expect(progress[0]).toEqual({ pulled: 500, total: 700 });
    expect(b.entity('students', studentId(1200))).toBeDefined();
  });

  it('defaults to a single-round pull when the feed is smaller than the chunk', async () => {
    const { hub, clock } = await seedHub(3);
    const b = new InMemorySyncLocalRepository(clock, DEV_B);

    const progress: SyncProgress[] = [];
    const result = await makeEngine({ hub, local: b, clock, deviceId: DEV_B, updatedBy: USER_B }).run(matcherFor(b), {
      onProgress: (p) => progress.push(p),
    });

    expect(result.status).toBe('synced');
    expect(result.applied).toBe(3);
    expect(progress).toEqual([{ pulled: 3, total: 3 }]);
  });
});
