import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Subject, SubjectId, CenterCode, DeviceId, UserId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { replayChangeLog } from '../../src/data/sqlite/change-log/replay-change-log';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROW_ORIGIN = 'dev_00000000000000000000000001' as DeviceId;
const ACTING_DEVICE = 'dev_00000000000000000000000009' as DeviceId;
const AT = new Date('2026-07-29T10:00:00Z');

const S1 = 'sub_00000000000000000000000001' as SubjectId;
const S2 = 'sub_00000000000000000000000002' as SubjectId;

type ChangeLogRow = {
  entity_type: string;
  entity_id: string;
  revision: number;
  op: string;
  payload: string;
  device_id: string;
  created_at: string;
  center_code: string;
};

let dir: string;
let db: DB;
let repo: SqliteSubjectRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-changelog-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteSubjectRepository(
    db,
    new SqliteChangeLogWriter(db, { now: () => AT }, ACTING_DEVICE),
  );
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeSubject(over: Partial<Subject> = {}): Subject {
  return {
    id: S1,
    centerCode: CENTER,
    deviceOrigin: ROW_ORIGIN,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    code: null,
    active: true,
    ...over,
  };
}

function logRows(database: DB): ChangeLogRow[] {
  return database
    .prepare('SELECT * FROM change_log ORDER BY rowid')
    .all() as ChangeLogRow[];
}

describe('change_log — append-only enforcement (DB layer)', () => {
  it('forbids DELETE of any change_log row (trigger RAISE(ABORT))', async () => {
    await repo.save(makeSubject());
    expect(() => db.prepare('DELETE FROM change_log').run()).toThrow(/append-only/);
    expect(logRows(db)).toHaveLength(1);
  });

  it('forbids UPDATE of any change_log row (trigger RAISE(ABORT))', async () => {
    await repo.save(makeSubject());
    expect(() => db.prepare("UPDATE change_log SET op = 'delete'").run()).toThrow(/append-only/);
  });

  it('rejects an op outside create|update|delete (CHECK)', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO change_log
             (entity_type, entity_id, revision, op, payload, device_id, created_at, center_code)
           VALUES ('subjects', ?, 1, 'purge', '{}', ?, ?, ?)`,
        )
        .run(S1, ACTING_DEVICE, AT.toISOString(), CENTER),
    ).toThrow();
  });
});

describe('change_log — writer semantics', () => {
  it('writes one row per repository write', async () => {
    await repo.save(makeSubject());
    await repo.save(makeSubject({ name: { fr: 'Physique', ar: 'فيزياء' }, version: 1 }));
    expect(logRows(db)).toHaveLength(2);
  });

  it('assigns a per-entity monotonic revision and derives op create→update→delete', async () => {
    await repo.save(makeSubject());
    await repo.save(makeSubject({ active: false, version: 1 }));
    await repo.softDelete(S1, new Date('2026-08-02T00:00:00Z'), USER);

    const rows = logRows(db);
    expect(rows.map((r) => [r.revision, r.op])).toEqual([
      [1, 'create'],
      [2, 'update'],
      [3, 'delete'],
    ]);
  });

  it('tracks revision independently per entity id', async () => {
    await repo.save(makeSubject({ id: S1 }));
    await repo.save(makeSubject({ id: S2, code: 'PC' }));
    await repo.save(makeSubject({ id: S1, version: 1 }));

    const rows = logRows(db);
    expect(rows.filter((r) => r.entity_id === S1).map((r) => r.revision)).toEqual([1, 2]);
    expect(rows.filter((r) => r.entity_id === S2).map((r) => r.revision)).toEqual([1]);
  });

  it('stamps the acting device, Clock UTC time, and tenant — not the row origin', async () => {
    await repo.save(makeSubject());
    const [row] = logRows(db);
    expect(row?.device_id).toBe(ACTING_DEVICE);
    expect(row?.created_at).toBe(AT.toISOString());
    expect(row?.center_code).toBe(CENTER);
    // The snapshot preserves the row's own creator, distinct from the acting device.
    expect(JSON.parse(row!.payload).device_origin).toBe(ROW_ORIGIN);
  });

  it('rolls back the log append and the entity write together (single transaction)', async () => {
    await repo.save(makeSubject({ id: S1, code: 'MATH' }));
    // A duplicate live code violates the partial unique index — the whole save aborts.
    await expect(repo.save(makeSubject({ id: S2, code: 'MATH' }))).rejects.toThrow();
    // No orphan log row for the failed write, no orphan subject row.
    expect(logRows(db).filter((r) => r.entity_id === S2)).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM subjects').get()).toEqual({ n: 1 });
  });
});

describe('change_log — replay rebuilds DB state', () => {
  it('reconstructs the subjects table from the log alone, tombstones included', async () => {
    await repo.save(makeSubject({ id: S1 }));
    await repo.save(makeSubject({ id: S1, name: { fr: 'Physique', ar: 'فيزياء' }, version: 2 }));
    await repo.save(makeSubject({ id: S2, code: 'PC' }));
    await repo.softDelete(S2, new Date('2026-08-02T00:00:00Z'), USER);

    const sourceSubjects = db.prepare('SELECT * FROM subjects ORDER BY id').all();

    const targetDir = mkdtempSync(join(tmpdir(), 'cs-changelog-target-'));
    const target = openDatabase({ centreId: 'C2', key: KEY, dir: targetDir });
    try {
      runMigrations(target, REAL_MIGRATIONS);
      copyChangeLog(db, target);
      expect(target.prepare('SELECT COUNT(*) AS n FROM subjects').get()).toEqual({ n: 0 });

      replayChangeLog(target);

      const rebuilt = target.prepare('SELECT * FROM subjects ORDER BY id').all();
      expect(rebuilt).toEqual(sourceSubjects);
      // Replay upserts directly — it must not append new log rows.
      expect(logRows(target)).toHaveLength(logRows(db).length);
    } finally {
      target.close();
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

function copyChangeLog(source: DB, target: DB): void {
  const insert = target.prepare(
    `INSERT INTO change_log
       (entity_type, entity_id, revision, op, payload, device_id, created_at, center_code)
     VALUES (@entity_type, @entity_id, @revision, @op, @payload, @device_id, @created_at, @center_code)`,
  );
  for (const row of logRows(source)) insert.run(row);
}
