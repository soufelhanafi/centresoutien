import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Subject, SubjectId, CenterCode, DeviceId, UserId, EntityId, SyncConflict } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { SqliteLocalSyncRepository } from '../../src/data/sqlite/change-log/sqlite-sync-local-repository';
import { ChangeLogOutbox } from '../../src/data/sqlite/change-log/change-log-outbox';

/**
 * SOU-180 — the device-side outbox. Proves the missing bridge: a real repository
 * write (through `change_log`) becomes a pushable pending change the engine can
 * push. Real SQLite, real `SqliteSubjectRepository` + `SqliteLocalSyncRepository`;
 * no hub — this is the local half of the cycle.
 */
const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_0000000000000000000000000A' as DeviceId;
const USER = 'usr_0000000000000000000000000A' as UserId;
const AT = new Date('2026-08-01T10:00:00Z');
const S1 = 'sub_00000000000000000000000001' as SubjectId;
const S2 = 'sub_00000000000000000000000002' as SubjectId;

let dir: string;
let db: DB;
let subjects: SqliteSubjectRepository;
let local: SqliteLocalSyncRepository;
let outbox: ChangeLogOutbox;

function makeSubject(over: Partial<Subject> = {}): Subject {
  return {
    id: S1,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-outbox-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  subjects = new SqliteSubjectRepository(db, new SqliteChangeLogWriter(db, { now: () => AT }, DEVICE));
  local = new SqliteLocalSyncRepository(db, { now: () => AT }, DEVICE, CENTER);
  outbox = new ChangeLogOutbox(db, local, CENTER, DEVICE, USER);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('ChangeLogOutbox — draining local writes into pending', () => {
  it('turns a freshly created entity into a create pending on baseVersion 0', async () => {
    await subjects.save(makeSubject());
    outbox.drain();

    const pending = local.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.entityType).toBe('subjects');
    expect(pending[0]?.entityId).toBe(S1);
    expect(pending[0]?.op).toBe('create');
    expect(pending[0]?.baseVersion).toBe(0);
    // All domain fields count as changed on a create; envelope + id never do.
    expect(pending[0]?.changedFields).toEqual(expect.arrayContaining(['name', 'active']));
    expect(pending[0]?.changedFields).not.toContain('id');
    expect(pending[0]?.changedFields).not.toContain('version');
    expect(pending[0]?.changedFields).not.toContain('updatedAt');
  });

  it('reports only the fields that changed on an update, based on the synced version', async () => {
    await subjects.save(makeSubject());
    outbox.drain();
    // Simulate the push being accepted at version 1: pending clears, base advances.
    local.markSynced('subjects', S1, 1);

    await subjects.save(makeSubject({ name: { fr: 'Physique', ar: 'فيزياء' }, version: 1 }));
    outbox.drain();

    const pending = local.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.op).toBe('update');
    expect(pending[0]?.baseVersion).toBe(1);
    expect(pending[0]?.changedFields).toEqual(['name']);
    expect((pending[0]?.entity['name'] as { fr: string }).fr).toBe('Physique');
  });

  it('collapses multiple undrained revisions of one entity into its latest snapshot', async () => {
    await subjects.save(makeSubject());
    await subjects.save(makeSubject({ active: false, version: 1 }));
    await subjects.save(makeSubject({ name: { fr: 'Chimie', ar: 'كيمياء' }, active: false, version: 2 }));
    outbox.drain();

    const pending = local.listPending();
    expect(pending).toHaveLength(1);
    expect((pending[0]?.entity['name'] as { fr: string }).fr).toBe('Chimie');
    expect(pending[0]?.entity['active']).toBe(false);
  });

  it('never re-enqueues an already-drained write (durable watermark)', async () => {
    await subjects.save(makeSubject());
    outbox.drain();
    local.markSynced('subjects', S1, 1); // push accepted → pending cleared

    outbox.drain(); // the create row is already past the watermark
    expect(local.listPending()).toHaveLength(0);

    // A fresh outbox instance (restart) still respects the persisted watermark.
    new ChangeLogOutbox(db, local, CENTER, DEVICE, USER).drain();
    expect(local.listPending()).toHaveLength(0);
  });

  it('enqueues a soft delete as a delete pending', async () => {
    await subjects.save(makeSubject());
    outbox.drain();
    local.markSynced('subjects', S1, 1);

    await subjects.softDelete(S1, AT, USER);
    outbox.drain();

    const pending = local.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.op).toBe('delete');
  });

  it('drains independent entities as separate pending writes', async () => {
    await subjects.save(makeSubject({ id: S1 }));
    await subjects.save(makeSubject({ id: S2, code: 'PC' }));
    outbox.drain();

    const ids = local.listPending().map((p) => p.entityId).sort();
    expect(ids).toEqual([S1, S2]);
  });

  it('leaves a blocked (conflicted) entity untouched — never clobbers an unresolved clash', async () => {
    await subjects.save(makeSubject());
    outbox.drain();
    const clash: SyncConflict = {
      kind: 'field-clash',
      entityType: 'subjects',
      entityId: S1 as unknown as EntityId,
      version: 1,
      fields: ['name'],
      mine: { updatedBy: USER, deviceId: DEVICE, op: 'update', seq: 1, at: AT, changedFields: ['name'], entity: makeSubject() },
      theirs: { updatedBy: USER, deviceId: DEVICE, op: 'update', seq: 2, at: AT, changedFields: ['name'], entity: makeSubject({ name: { fr: 'Autre', ar: 'آخر' } }) },
    };
    local.blockPending('subjects', S1 as unknown as EntityId, clash);

    // A later local edit to the SAME entity must not overwrite the blocked write.
    await subjects.save(makeSubject({ name: { fr: 'Encore', ar: 'مرة' }, version: 1 }));
    outbox.drain();

    expect(local.listBlocked()).toHaveLength(1);
    expect(local.listPending()).toHaveLength(0); // still blocked, nothing pushable
  });
});
