import { describe, it, expect } from 'vitest';
import { resolveInboundChange } from '../../../src/sync/merge';
import type { HubChange, LocalChange } from '../../../src/ports/sync-hub-port';
import type { DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';

/**
 * Immutable-entity divergence (SOU-81): invoices, formulas, and teacher-payouts
 * carry locked decisions that must never fork across devices. A real edit on
 * either side is divergence — no silent merge, no field-clash popup. The device
 * with no edit still fast-forwards; a both-deleted agreement still applies.
 * Mutable entities are untouched by the guard.
 */

const DEV_A = 'dev_0000000000000000000000000A' as DeviceId;
const DEV_B = 'dev_0000000000000000000000000B' as DeviceId;
const USER_A = 'usr_0000000000000000000000000A' as UserId;
const USER_B = 'usr_0000000000000000000000000B' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as EntityId;
const STUDENT = 'stu_00000000000000000000000001' as EntityId;

function local(overrides: Partial<LocalChange>): LocalChange {
  return {
    entityType: 'invoices',
    entityId: INVOICE,
    deviceId: DEV_A,
    baseVersion: 1,
    op: 'update',
    entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'draft' },
    changedFields: [],
    seq: 2,
    at: new Date('2026-08-01T09:00:00Z'),
    updatedBy: USER_A,
    ...overrides,
  };
}

function inbound(overrides: Partial<HubChange>): HubChange {
  return {
    entityType: 'invoices',
    entityId: INVOICE,
    version: 2,
    op: 'update',
    entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'draft' },
    changedFields: [],
    deviceId: DEV_B,
    updatedBy: USER_B,
    deviceSeq: 1,
    receivedAt: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  };
}

describe('resolveInboundChange — immutable-entity divergence', () => {
  it('both sides editing DISJOINT fields on an immutable entity is divergence, not a silent merge', () => {
    const outcome = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: local({ changedFields: ['status'], entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'sent' } }),
      inbound: inbound({ changedFields: ['note'], entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'draft', note: 'urgent' } }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
    if (outcome.kind !== 'immutable-divergence') return;
    expect(outcome.entityType).toBe('invoices');
    expect(outcome.entityId).toBe(INVOICE);
  });

  it('both sides editing the SAME field to different values is divergence, never a field-clash popup', () => {
    const outcome = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: local({ changedFields: ['amount'], entity: { id: INVOICE, month: '2026-08', amount: 300, status: 'draft' } }),
      inbound: inbound({ changedFields: ['amount'], entity: { id: INVOICE, month: '2026-08', amount: 400, status: 'draft' } }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
  });

  it('a device with NO local edit fast-forwards to the canonical state even on an immutable entity', () => {
    const outcome = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: null,
      inbound: inbound({ changedFields: ['status'], entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'paid' } }),
    });

    expect(outcome.kind).toBe('apply');
    if (outcome.kind !== 'apply') return;
    expect(outcome.entity.status).toBe('paid');
  });

  it('delete-vs-edit on an immutable entity is divergence, never a popup choice', () => {
    // Mine deleted, theirs edited.
    const deletedMine = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: local({ op: 'delete', changedFields: [], entity: { id: INVOICE, deletedAt: '2026-08-01T09:00:00Z' } }),
      inbound: inbound({ op: 'update', changedFields: ['amount'], entity: { id: INVOICE, amount: 400, status: 'draft' } }),
    });
    expect(deletedMine.kind).toBe('immutable-divergence');

    // Theirs deleted, mine edited.
    const editedMine = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: local({ op: 'update', changedFields: ['amount'], entity: { id: INVOICE, amount: 400, status: 'draft' } }),
      inbound: inbound({ op: 'delete', changedFields: [], entity: { id: INVOICE, deletedAt: '2026-08-01T10:00:00Z' } }),
    });
    expect(editedMine.kind).toBe('immutable-divergence');
  });

  it('both deleted on an immutable entity is agreement, not divergence — takes the canonical tombstone', () => {
    const outcome = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: local({ op: 'delete', changedFields: [], entity: { id: INVOICE, deletedAt: '2026-08-01T09:00:00Z' } }),
      inbound: inbound({ op: 'delete', changedFields: [], entity: { id: INVOICE, deletedAt: '2026-08-01T10:00:00Z' } }),
    });

    expect(outcome.kind).toBe('apply');
    if (outcome.kind !== 'apply') return;
    expect(outcome.entity.deletedAt).toBe('2026-08-01T10:00:00Z');
  });

  it('does not over-trigger: disjoint edits on a MUTABLE entity still auto-merge', () => {
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({
        entityType: 'students',
        entityId: STUDENT,
        changedFields: ['phone'],
        entity: { id: STUDENT, name: 'Yassine', phone: '0666666666', level: '2 Bac' },
      }),
      inbound: inbound({
        entityType: 'students',
        entityId: STUDENT,
        changedFields: ['level'],
        entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '1 Bac' },
      }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    expect(outcome.entity.phone).toBe('0666666666');
    expect(outcome.entity.level).toBe('1 Bac');
  });

  it('the guard covers every immutable entity type', () => {
    for (const entityType of ['invoices', 'formulas', 'teacher-payouts']) {
      const outcome = resolveInboundChange({
        entityType,
        entityId: INVOICE,
        local: local({ changedFields: ['amount'], entity: { id: INVOICE, amount: 300 } }),
        inbound: inbound({ changedFields: ['amount'], entity: { id: INVOICE, amount: 400 } }),
      });
      expect(outcome.kind).toBe('immutable-divergence');
    }
  });
});
