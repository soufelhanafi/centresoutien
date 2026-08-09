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
  });

  it('stores the versioned DOMAIN entity, not the physical snake_case row (SOU-170)', async () => {
    await repo.save(makeSubject());
    const [row] = logRows(db);
    const payload = JSON.parse(row!.payload) as {
      version: number;
      entity: {
        deviceOrigin: string;
        name: { fr: string; ar: string };
        active: boolean;
        createdAt: string;
        updatedAt: string;
        version: number;
      };
    };
    expect(payload.version).toBe(1);
    // CamelCase domain shape with nested bilingual fields and real booleans —
    // none of the physical `name_fr`/`name_ar`/`active AS 0/1` row shape.
    expect(payload.entity.deviceOrigin).toBe(ROW_ORIGIN);
    expect(payload.entity.name).toEqual({ fr: 'Mathématiques', ar: 'الرياضيات' });
    expect(payload.entity.active).toBe(true);
    expect(payload.entity.createdAt).toBe(AT.toISOString());
    expect(payload.entity.updatedAt).toBe(AT.toISOString());
    expect(payload.entity.version).toBe(0);
    expect(JSON.stringify(payload)).not.toContain('name_fr');
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

  it('replays a payload written under an older schema onto a migrated table (additive column)', async () => {
    await repo.save(makeSubject({ id: S1 }));
    await repo.save(makeSubject({ id: S2, code: 'PC' }));

    const targetDir = mkdtempSync(join(tmpdir(), 'cs-changelog-migrated-'));
    const target = openDatabase({ centreId: 'C2', key: KEY, dir: targetDir });
    try {
      runMigrations(target, REAL_MIGRATIONS);
      // A future additive migration lands after the payloads were written.
      target.prepare(
        "ALTER TABLE subjects ADD COLUMN subject_color TEXT NOT NULL DEFAULT 'rouge'",
      ).run();
      copyChangeLog(db, target);

      replayChangeLog(target);

      // Old payloads still reconstruct the rows; the new column falls back to
      // its DEFAULT because the payload (domain shape) never names it.
      const rebuilt = target.prepare('SELECT * FROM subjects ORDER BY id').all() as {
        id: string;
        name_fr: string;
        subject_color: string;
      }[];
      expect(rebuilt).toHaveLength(2);
      expect(rebuilt[0]?.name_fr).toBe('Mathématiques');
      expect(rebuilt[0]?.subject_color).toBe('rouge');
      expect(rebuilt[1]?.id).toBe(S2);
    } finally {
      target.close();
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it('replays a multi-word backup sheet via the table-name fallback (SOU-170 B1)', () => {
    // `entity_type` is the PHYSICAL TABLE name (`student_subscriptions`), which
    // diverges from the sheet name (`student-subscriptions`) — the fallback must
    // resolve on the table name or this row aborts the whole replay.
    const subscription: Record<string, unknown> = {
      id: 'sbs_00000000000000000000000001',
      centerCode: CENTER,
      deviceOrigin: ROW_ORIGIN,
      createdAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
      updatedBy: USER,
      deletedAt: null,
      version: 1,
      studentId: 'stu_00000000000000000000000001',
      formulaId: 'fml_00000000000000000000000001',
      kind: 'regular',
      subjectIds: 'sub_00000000000000000000000001,sub_00000000000000000000000002',
      startMonth: '2026-09',
      endMonth: null,
    };
    insertLogRow(db, 'student_subscriptions', subscription);

    replayChangeLog(db);

    const row = db
      .prepare('SELECT * FROM student_subscriptions WHERE id = ?')
      .get(subscription['id']) as Record<string, unknown>;
    expect(row['student_id']).toBe('stu_00000000000000000000000001');
    expect(row['subject_ids']).toBe(
      '["sub_00000000000000000000000001","sub_00000000000000000000000002"]',
    );
    expect(row['kind']).toBe('regular');
    expect(row['start_month']).toBe('2026-09');
  });

  it('replays a weekly recurring session flat row through the explicit mapper, group_id included (SOU-132)', () => {
    // The backup store logs these tables as FLAT rows (SHEET_BY_TABLE config). The
    // explicit SOU-132 mapper now shadows that sheet fallback on replay — this
    // proves a flat backup-shaped payload still lands correctly, group_id intact.
    const wrs: Record<string, unknown> = {
      id: 'wrs_00000000000000000000000001',
      centerCode: CENTER,
      deviceOrigin: ROW_ORIGIN,
      createdAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
      updatedBy: USER,
      deletedAt: null,
      version: 1,
      roomId: 'rom_00000000000000000000000001',
      teacherId: 'tch_00000000000000000000000001',
      groupId: 'grp_00000000000000000000000001',
      dayOfWeek: 2,
      start: '09:00',
      end: '11:00',
      active: true,
      validFrom: '2026-09-01',
      validTo: null,
    };
    insertLogRow(db, 'weekly_recurring_sessions', wrs);
    replayChangeLog(db);

    const row = db
      .prepare('SELECT * FROM weekly_recurring_sessions WHERE id = ?')
      .get(wrs.id) as
      | { group_id: string | null; room_id: string; day_of_week: number; active: number }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.group_id).toBe('grp_00000000000000000000000001');
    expect(row?.room_id).toBe('rom_00000000000000000000000001');
    expect(row?.day_of_week).toBe(2);
    expect(row?.active).toBe(1);
  });

  it('replays a concrete session flat row through the explicit mapper, group_id included (SOU-132)', () => {
    const session: Record<string, unknown> = {
      id: 'ses_00000000000000000000000001',
      centerCode: CENTER,
      deviceOrigin: ROW_ORIGIN,
      createdAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
      updatedBy: USER,
      deletedAt: null,
      version: 1,
      recurringSessionId: 'wrs_00000000000000000000000001',
      generationBatchId: null,
      roomId: 'rom_00000000000000000000000001',
      teacherId: null,
      groupId: 'grp_00000000000000000000000001',
      date: '2026-09-05',
      start: '09:00',
      end: '10:30',
    };
    insertLogRow(db, 'sessions', session);
    replayChangeLog(db);

    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(session.id) as
      | { group_id: string | null; recurring_session_id: string; date: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.group_id).toBe('grp_00000000000000000000000001');
    expect(row?.recurring_session_id).toBe('wrs_00000000000000000000000001');
    expect(row?.date).toBe('2026-09-05');
  });

  it('throws on an entityType with no registered mapper rather than guessing', () => {
    insertLogRow(db, 'not_a_known_table', { id: 'xx_00000000000000000000000001' });

    expect(() => replayChangeLog(db)).toThrow(/no entity→row mapper registered for "not_a_known_table"/);
  });

  it('applies the upcaster chain before mapping on replay', () => {
    // A hypothetical old payload shape (flat `name_fr`/`name_ar`), written at
    // version 1; the upcaster migrates it to the nested domain Subject the
    // current mapper expects.
    const flatSubject: Record<string, unknown> = {
      id: S1,
      centerCode: CENTER,
      deviceOrigin: ROW_ORIGIN,
      createdAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
      updatedBy: USER,
      deletedAt: null,
      version: 1,
      name_fr: 'Ancien',
      name_ar: 'قديم',
      code: null,
      active: true,
    };
    insertLogRow(db, 'subjects', flatSubject, 1);

    replayChangeLog(db, [
      (entity) => {
        const row = entity as Record<string, unknown>;
        return {
          ...row,
          name: { fr: row['name_fr'], ar: row['name_ar'] },
          active: row['active'] === true || row['active'] === 1,
        };
      },
    ]);

    const rebuilt = db
      .prepare('SELECT * FROM subjects WHERE id = ?')
      .get(S1) as Record<string, unknown>;
    expect(rebuilt['name_fr']).toBe('Ancien');
    expect(rebuilt['name_ar']).toBe('قديم');
    expect(rebuilt['active']).toBe(1);
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

function insertLogRow(
  db: DB,
  entityType: string,
  entity: Record<string, unknown>,
  revision = 1,
): void {
  db.prepare(
    `INSERT INTO change_log
       (entity_type, entity_id, revision, op, payload, device_id, created_at, center_code)
     VALUES (?, ?, ?, 'create', ?, ?, ?, ?)`,
  ).run(
    entityType,
    entity['id'],
    revision,
    JSON.stringify({ version: 1, entity }),
    ACTING_DEVICE,
    AT.toISOString(),
    CENTER,
  );
}
