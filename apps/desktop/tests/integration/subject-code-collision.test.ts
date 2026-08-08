import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { CenterCode, DeviceId, UserId, EntityId } from '@centresoutien/domain';
import type { HubChange, SubjectCodeCollision } from '@centresoutien/domain';
import { ChangeResolver, DuplicateMatcher } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteLocalSyncRepository } from '../../src/data/sqlite/change-log/sqlite-sync-local-repository';

/**
 * SOU-122 — two replicas independently create a live subject with the same code.
 * When the peer's row is pulled, its projection onto the real `subjects` table
 * would violate the partial unique index `ux_subjects_code` and throw
 * `SQLITE_CONSTRAINT_UNIQUE`. The resolver must instead auto-resolve (lower ULID
 * keeps the code, the loser's is nulled) so apply never throws and both survive.
 */

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEV = 'dev_0000000000000000000000000A' as DeviceId;
const PEER = 'dev_0000000000000000000000000B' as DeviceId;
const USER = 'usr_0000000000000000000000000A' as UserId;
const AT = new Date('2026-08-01T10:00:00Z');

const SUB_LO = 'sub_00000000000000000000000001' as EntityId;
const SUB_HI = 'sub_00000000000000000000000002' as EntityId;

let dir: string;
let db: DB;
let repo: SqliteLocalSyncRepository;

const NOOP_MATCHER = new DuplicateMatcher({
  findParentsByPhone: () => [],
  findTeachersByPhone: () => [],
  findStudentsByName: () => [],
});

const subject = (id: EntityId, code: string | null) => ({
  id,
  centerCode: CENTER,
  deviceOrigin: DEV,
  createdAt: AT,
  updatedAt: AT,
  updatedBy: USER,
  deletedAt: null,
  version: 1,
  name: { fr: 'Maths', ar: 'رياضيات' },
  code,
  active: true,
});

const inbound = (id: EntityId): HubChange => ({
  entityType: 'subjects',
  entityId: id,
  version: 1,
  seq: 1,
  op: 'create',
  entity: subject(id, 'MATH'),
  changedFields: [],
  deviceId: PEER,
  updatedBy: USER,
  deviceSeq: 1,
  receivedAt: AT,
});

function resolver(): ChangeResolver {
  return new ChangeResolver(repo, { now: () => AT }, DEV, USER, CENTER, repo);
}

function projectedCode(id: EntityId): { code: string | null; deleted_at: string | null } {
  return db.prepare('SELECT code, deleted_at FROM subjects WHERE id = ?').get(id) as {
    code: string | null;
    deleted_at: string | null;
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-subject-collision-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteLocalSyncRepository(db, { now: () => AT }, DEV, CENTER);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('subject code collision on sync-apply (SOU-122)', () => {
  it('inbound lower ULID wins: it keeps MATH, the local loser is nulled, neither throws', () => {
    repo.applyInbound('subjects', SUB_HI, subject(SUB_HI, 'MATH'), 1); // pre-existing local live MATH

    const collisions: SubjectCodeCollision[] = [];
    const applied = resolver().resolveBatch([inbound(SUB_LO)], [], NOOP_MATCHER, collisions);

    expect(applied).toBe(1);
    expect(projectedCode(SUB_LO)).toEqual({ code: 'MATH', deleted_at: null }); // winner
    expect(projectedCode(SUB_HI)).toEqual({ code: null, deleted_at: null }); // loser freed, survives
    expect(collisions).toEqual([
      { entityType: 'subjects', code: 'MATH', winnerId: SUB_LO, loserId: SUB_HI },
    ]);
  });

  it('inbound higher ULID loses: it is applied with a null code, local winner keeps MATH', () => {
    repo.applyInbound('subjects', SUB_LO, subject(SUB_LO, 'MATH'), 1);

    const collisions: SubjectCodeCollision[] = [];
    const applied = resolver().resolveBatch([inbound(SUB_HI)], [], NOOP_MATCHER, collisions);

    expect(applied).toBe(1);
    expect(projectedCode(SUB_LO)).toEqual({ code: 'MATH', deleted_at: null }); // winner
    expect(projectedCode(SUB_HI)).toEqual({ code: null, deleted_at: null }); // inbound loser
    expect(collisions).toEqual([
      { entityType: 'subjects', code: 'MATH', winnerId: SUB_LO, loserId: SUB_HI },
    ]);
  });

  it('clearing the loser nulls the shadow snapshot too, so a push cannot re-introduce the code', () => {
    repo.applyInbound('subjects', SUB_HI, subject(SUB_HI, 'MATH'), 1);
    resolver().resolveBatch([inbound(SUB_LO)], [], NOOP_MATCHER, []);

    expect(repo.getLocalState('subjects', SUB_HI)?.entity['code']).toBeNull();
  });
});
