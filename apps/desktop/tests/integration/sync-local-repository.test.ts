import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { CenterCode, DeviceId, UserId, EntityId } from '@centresoutien/domain';
import type { SyncConflict } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteLocalSyncRepository } from '../../src/data/sqlite/change-log/sqlite-sync-local-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEV = 'dev_0000000000000000000000000A' as DeviceId;
const USER = 'usr_0000000000000000000000000A' as UserId;
const S1 = 'stu_00000000000000000000000001' as EntityId;
const PAY1 = 'pay_00000000000000000000000001' as EntityId;
const PAY2 = 'pay_00000000000000000000000002' as EntityId;
const PAY3 = 'pay_00000000000000000000000003' as EntityId;
const SUB1 = 'sub_00000000000000000000000001' as EntityId;
const AT = new Date('2026-08-01T10:00:00Z');

let dir: string;
let db: DB;
let repo: SqliteLocalSyncRepository;

const entity = (over: Record<string, unknown> = {}) => ({
  id: S1,
  name: { fr: 'Yassine', ar: 'ياسين' },
  phone: '0611111111',
  ...over,
});

function makeFieldClash(): SyncConflict {
  return {
    kind: 'field-clash',
    entityType: 'students',
    entityId: S1,
    version: 2,
    fields: ['phone'],
    mine: {
      updatedBy: USER,
      deviceId: DEV,
      op: 'update',
      seq: 1,
      at: AT,
      changedFields: ['phone'],
      entity: entity({ phone: '0777777777' }),
    },
    theirs: {
      updatedBy: USER,
      deviceId: DEV,
      op: 'update',
      seq: 2,
      at: AT,
      changedFields: ['phone'],
      entity: entity({ phone: '0666666666' }),
    },
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-sync-local-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteLocalSyncRepository(db, { now: () => AT }, DEV, CENTER);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteLocalSyncRepository', () => {
  it('applyInbound stores canonical state and clears any pending write', () => {
    repo.upsertPending({
      entityType: 'students',
      entityId: S1,
      deviceId: DEV,
      entity: entity({ phone: '0777777777' }),
      changedFields: ['phone'],
      baseVersion: 1,
      op: 'update',
      updatedBy: USER,
      at: AT,
    });
    repo.applyInbound('students', S1, entity({ phone: '0666666666' }), 3);

    const state = repo.getLocalState('students', S1);
    expect(state?.version).toBe(3);
    expect(state?.entity['phone']).toBe('0666666666');
    expect(state?.pending).toBeNull();
  });

  it('upsertPending records a pushable pending write', () => {
    repo.upsertPending({
      entityType: 'students',
      entityId: S1,
      deviceId: DEV,
      entity: entity({ phone: '0777777777' }),
      changedFields: ['phone'],
      baseVersion: 1,
      op: 'update',
      updatedBy: USER,
      at: AT,
    });

    const pending = repo.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.entity['phone']).toBe('0777777777');
    expect(pending[0]?.baseVersion).toBe(1);
  });

  it('markSynced clears the pending write and advances the canonical version', () => {
    repo.upsertPending({
      entityType: 'students',
      entityId: S1,
      deviceId: DEV,
      entity: entity({ phone: '0777777777' }),
      changedFields: ['phone'],
      baseVersion: 1,
      op: 'update',
      updatedBy: USER,
      at: AT,
    });
    repo.markSynced('students', S1, 4);

    expect(repo.listPending()).toHaveLength(0);
    expect(repo.getLocalState('students', S1)?.version).toBe(4);
  });

  it('markSynced keeps append-only payment rows immutable and advances shadow version', () => {
    const payment = paymentEntity(PAY1, { version: 0 });
    insertPayment(payment);
    repo.upsertPending({
      entityType: 'payments',
      entityId: PAY1,
      deviceId: DEV,
      entity: payment,
      changedFields: [],
      baseVersion: 0,
      op: 'create',
      updatedBy: USER,
      at: AT,
    });

    repo.markSynced('payments', PAY1, 7);

    const row = db.prepare('SELECT version FROM payments WHERE id = ?').get(PAY1) as { version: number };
    expect(row.version).toBe(0);
    expect(repo.getLocalState('payments', PAY1)?.version).toBe(7);
    expect(repo.listPending()).toHaveLength(0);
  });

  it('append-only projection keeps inbound duplicate reversals when the unique backstop exists', () => {
    insertPayment(paymentEntity(PAY1));
    insertPayment(
      paymentEntity(PAY3, {
        kind: 'reversal',
        amountMad: 10000,
        reversesPaymentId: PAY1,
      }),
    );
    db.prepare(
      `CREATE UNIQUE INDEX ux_payments_reversal_once
        ON payments(reverses_payment_id)
        WHERE kind = 'reversal' AND deleted_at IS NULL`,
    ).run();

    repo.applyInbound(
      'payments',
      PAY2,
      paymentEntity(PAY2, { kind: 'reversal', amountMad: 10000, reversesPaymentId: PAY1 }),
      9,
    );

    const rows = db
      .prepare(
        `SELECT id FROM payments
          WHERE kind = 'reversal' AND reverses_payment_id = ?
          ORDER BY id`,
      )
      .all(PAY1) as { id: string }[];
    expect(rows.map((row) => row.id)).toEqual([PAY2, PAY3]);
    expect(repo.getLocalState('payments', PAY2)?.version).toBe(9);
  });

  it('mutable subject projections still update existing real rows', () => {
    repo.applyInbound('subjects', SUB1, subjectEntity({ name: { fr: 'Math', ar: 'رياضيات' }, version: 1 }), 1);
    repo.applyInbound('subjects', SUB1, subjectEntity({ name: { fr: 'Physique', ar: 'فيزياء' }, version: 2 }), 2);

    const row = db.prepare('SELECT name_fr, version FROM subjects WHERE id = ?').get(SUB1) as {
      name_fr: string;
      version: number;
    };
    expect(row).toEqual({ name_fr: 'Physique', version: 2 });
  });

  it('blockPending persists the conflict so listBlocked re-surfaces it after restart', () => {
    repo.upsertPending({
      entityType: 'students',
      entityId: S1,
      deviceId: DEV,
      entity: entity({ phone: '0777777777' }),
      changedFields: ['phone'],
      baseVersion: 1,
      op: 'update',
      updatedBy: USER,
      at: AT,
    });
    repo.blockPending('students', S1, makeFieldClash());

    expect(repo.listPending()).toHaveLength(0); // blocked writes never push
    const blocked = repo.listBlocked();
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.kind).toBe('field-clash');
    expect(blocked[0]).toMatchObject({ entityType: 'students', entityId: S1, fields: ['phone'] });

    // Survives a fresh repository instance (restart): Dates revived to Date.
    repo = new SqliteLocalSyncRepository(db, { now: () => AT }, DEV, CENTER);
    const afterRestart = repo.listBlocked();
    expect(afterRestart).toHaveLength(1);
    if (afterRestart[0]?.kind !== 'field-clash') return;
    expect(afterRestart[0].mine.at).toBeInstanceOf(Date);
    expect(afterRestart[0].mine.at.toISOString()).toBe(AT.toISOString());
  });

  it('resolveBlocked replaces the blocked write with a fresh pushable pending', () => {
    repo.upsertPending({
      entityType: 'students',
      entityId: S1,
      deviceId: DEV,
      entity: entity({ phone: '0777777777' }),
      changedFields: ['phone'],
      baseVersion: 1,
      op: 'update',
      updatedBy: USER,
      at: AT,
    });
    repo.blockPending('students', S1, makeFieldClash());

    repo.resolveBlocked({
      entityType: 'students',
      entityId: S1,
      entity: entity({ phone: '0666666666' }),
      changedFields: ['phone'],
      baseVersion: 2,
      op: 'update',
      updatedBy: USER,
      at: AT,
    });

    expect(repo.listBlocked()).toHaveLength(0);
    const pending = repo.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.entity['phone']).toBe('0666666666');
    expect(pending[0]?.baseVersion).toBe(2);
  });

  it('blockPending without a conflict (immutable-divergence) blocks but stores nothing', () => {
    repo.upsertPending({
      entityType: 'students',
      entityId: S1,
      deviceId: DEV,
      entity: entity(),
      changedFields: ['phone'],
      baseVersion: 1,
      op: 'update',
      updatedBy: USER,
      at: AT,
    });
    repo.blockPending('students', S1);
    expect(repo.listPending()).toHaveLength(0);
    expect(repo.listBlocked()).toHaveLength(0);
  });

  it('cursor persists across repository instances', () => {
    repo.setCursor({ seq: 42 });
    repo = new SqliteLocalSyncRepository(db, { now: () => AT }, DEV, CENTER);
    expect(repo.getCursor()).toEqual({ seq: 42 });
  });

  it('delete-vs-edit conflicts round-trip with Dates revived', () => {
    const conflict: SyncConflict = {
      kind: 'delete-vs-edit',
      entityType: 'students',
      entityId: S1,
      version: 3,
      mine: {
        updatedBy: USER,
        deviceId: DEV,
        op: 'delete',
        seq: 1,
        at: AT,
        changedFields: [],
        entity: { ...entity(), deletedAt: AT.toISOString() },
      },
      theirs: {
        updatedBy: USER,
        deviceId: DEV,
        op: 'update',
        seq: 2,
        at: AT,
        changedFields: ['level'],
        entity: entity({ level: '3AC' }),
      },
    };
    repo.upsertPending({
      entityType: 'students',
      entityId: S1,
      deviceId: DEV,
      entity: { ...entity(), deletedAt: AT.toISOString() },
      changedFields: [],
      baseVersion: 2,
      op: 'delete',
      updatedBy: USER,
      at: AT,
    });
    repo.blockPending('students', S1, conflict);

    const revived = repo.listBlocked();
    expect(revived[0]?.kind).toBe('delete-vs-edit');
    if (revived[0]?.kind !== 'delete-vs-edit') return;
    expect(revived[0].mine.at).toBeInstanceOf(Date);
  });
});

function paymentEntity(id: EntityId, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    centerCode: CENTER,
    deviceOrigin: DEV,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    invoiceId: 'inv_00000000000000000000000001',
    kind: 'payment',
    amountMad: 10000,
    method: 'cash',
    paidOn: '2026-08-01',
    reversesPaymentId: null,
    note: null,
    ...over,
  };
}

function subjectEntity(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SUB1,
    centerCode: CENTER,
    deviceOrigin: DEV,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 1,
    name: { fr: 'Math', ar: 'رياضيات' },
    code: 'MATH',
    active: true,
    ...over,
  };
}

function insertPayment(payment: Record<string, unknown>): void {
  db.prepare(
    `INSERT INTO payments
      (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
       version, invoice_id, kind, amount_mad, method, paid_on, reverses_payment_id, note)
     VALUES
      (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
       @version, @invoice_id, @kind, @amount_mad, @method, @paid_on, @reverses_payment_id, @note)`,
  ).run({
    id: payment['id'],
    center_code: payment['centerCode'],
    device_origin: payment['deviceOrigin'],
    created_at: (payment['createdAt'] as Date).toISOString(),
    updated_at: (payment['updatedAt'] as Date).toISOString(),
    updated_by: payment['updatedBy'],
    deleted_at: null,
    version: payment['version'],
    invoice_id: payment['invoiceId'],
    kind: payment['kind'],
    amount_mad: payment['amountMad'],
    method: payment['method'],
    paid_on: payment['paidOn'],
    reverses_payment_id: payment['reversesPaymentId'],
    note: payment['note'],
  });
}
