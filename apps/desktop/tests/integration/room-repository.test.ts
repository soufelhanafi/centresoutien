import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Room, RoomId, CenterCode, DeviceId, UserId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteRoomRepository } from '../../src/data/sqlite/repositories/room-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;

let dir: string;
let db: DB;
let repo: SqliteRoomRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-rom-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteRoomRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeRoom(over: Partial<Room> = {}): Room {
  seq += 1;
  return {
    id: `rom_${String(seq).padStart(26, '0')}` as RoomId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: 'Salle A',
    capacity: 20,
    active: true,
    ...over,
  };
}

describe('SqliteRoomRepository', () => {
  it('round-trips a room through save + findById with all fields intact', async () => {
    const room = makeRoom({ name: 'Salle B', capacity: 12 });
    await repo.save(room);
    expect(await repo.findById(room.id)).toEqual(room);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('rom_00000000000000000000000099' as RoomId)).toBeNull();
  });

  it('upsert updates mutable fields + version but not identity on a second save', async () => {
    const room = makeRoom();
    await repo.save(room);
    await repo.save(
      makeRoom({
        id: room.id,
        name: 'Salle Renommée',
        capacity: 40,
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById(room.id);
    expect(found?.name).toBe('Salle Renommée');
    expect(found?.capacity).toBe(40);
    expect(found?.version).toBe(3);
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.deviceOrigin).toBe('dev_00000000000000000000000001');
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const room = makeRoom();
    await repo.save(room);
    await repo.softDelete(room.id, new Date('2026-08-02T00:00:00Z'), USER);

    expect(await repo.findById(room.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeRoom({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      const later = makeRoom({ updatedAt: new Date('2026-07-20T00:00:00Z') });
      await repo.save(later);

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((r) => r.id)).toEqual([later.id]);
    });
  });

  describe('listActive', () => {
    it('returns only live rooms of the center, ordered by name, excluding tombstones + other centers', async () => {
      await repo.save(makeRoom({ name: 'Salle C' }));
      await repo.save(makeRoom({ name: 'Salle A' }));
      const gone = makeRoom({ name: 'Salle Z' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeRoom({ name: 'Salle Étrangère', centerCode: OTHER_CENTER }));

      const active = await repo.listActive(CENTER);
      expect(active.map((r) => r.name)).toEqual(['Salle A', 'Salle C']);
    });
  });

  describe('listArchived', () => {
    it('returns only tombstoned rooms of the center, ordered by name', async () => {
      await repo.save(makeRoom({ name: 'Salle A' }));
      const g1 = makeRoom({ name: 'Salle Y' });
      const g2 = makeRoom({ name: 'Salle X' });
      await repo.save(g1);
      await repo.save(g2);
      await repo.softDelete(g1.id, AT, USER);
      await repo.softDelete(g2.id, AT, USER);

      const archived = await repo.listArchived(CENTER);
      expect(archived.map((r) => r.name)).toEqual(['Salle X', 'Salle Y']);
    });
  });

  describe('countActive', () => {
    it('counts only live rooms in the given center', async () => {
      await repo.save(makeRoom());
      const gone = makeRoom();
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeRoom({ centerCode: OTHER_CENTER }));

      expect(await repo.countActive(CENTER)).toBe(1);
      expect(await repo.countActive(OTHER_CENTER)).toBe(1);
    });
  });

  describe('findArchivedById', () => {
    it('returns a tombstoned row and null for a live or unknown id', async () => {
      const live = makeRoom();
      await repo.save(live);
      expect(await repo.findArchivedById(live.id)).toBeNull(); // live → not archived

      const gone = makeRoom();
      await repo.save(gone);
      await repo.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), USER);
      const found = await repo.findArchivedById(gone.id);
      expect(found?.id).toBe(gone.id);
      expect(found?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));

      expect(await repo.findArchivedById('rom_00000000000000000000000099' as RoomId)).toBeNull();
    });

    it('round-trips a restore: clear deleted_at via save, then the row is live again', async () => {
      const room = makeRoom();
      await repo.save(room);
      await repo.softDelete(room.id, new Date('2026-08-02T00:00:00Z'), USER);

      const archived = await repo.findArchivedById(room.id);
      expect(archived).not.toBeNull();
      await repo.save({ ...(archived as Room), deletedAt: null, updatedAt: new Date('2026-08-03T00:00:00Z') });

      expect(await repo.findById(room.id)).not.toBeNull();
      expect(await repo.findArchivedById(room.id)).toBeNull();
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the rom_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeRoom({ id: 'bad_00000000000000000000000001' as RoomId })),
      ).rejects.toThrow();
    });

    it('rejects a capacity below 1 (CHECK)', async () => {
      await expect(repo.save(makeRoom({ capacity: 0 }))).rejects.toThrow();
    });

    it('round-trips the active flag as a boolean', async () => {
      const room = makeRoom({ active: true });
      await repo.save(room);
      expect((await repo.findById(room.id))?.active).toBe(true);
    });
  });
});
