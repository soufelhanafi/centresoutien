import { describe, it, expect } from 'vitest';
import { resolveInboundChange } from '../../../src/sync/merge';
import { isImmutableEntityType } from '../../../src/sync/immutable-entities';
import type { HubChange, LocalChange } from '../../../src/ports/sync-hub-port';
import type { DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';

/**
 * Immutable-entity divergence (SOU-81): invoices, formulas, and teacher_payouts
 * carry locked decisions that must never fork across devices. An edit touching
 * a protected field on either side is divergence — no silent merge, no
 * field-clash popup; the sync aborts loudly. Documented mutable fields on these
 * entities (Formula.name / Formula.active, TeacherPayout.notes) are ordinary
 * data: disjoint edits auto-merge, same-field edits clash to a human. The
 * device with no edit still fast-forwards; a both-deleted agreement still
 * applies.
 */

const DEV_A = 'dev_0000000000000000000000000A' as DeviceId;
const DEV_B = 'dev_0000000000000000000000000B' as DeviceId;
const USER_A = 'usr_0000000000000000000000000A' as UserId;
const USER_B = 'usr_0000000000000000000000000B' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as EntityId;
const FORMULA = 'fml_00000000000000000000000001' as EntityId;
const PAYOUT = 'pyo_00000000000000000000000001' as EntityId;
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

function formulaEntity(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return { id: FORMULA, name: { fr: 'Math + Physique', ar: 'رياضيات + فيزياء' }, priceMad: 35000, active: true, ...overrides };
}

function payoutEntity(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return { id: PAYOUT, teacherId: 'tea_00000000000000000000000001', month: '2026-08', ruleKind: 'fixed-monthly', amountMad: 30000, baseAmountMad: null, percentSnapshot: null, status: 'draft', notes: null, ...overrides };
}

describe('resolveInboundChange — immutable-entity divergence', () => {
  it('a formula NAME-only edit auto-merges, never diverges', () => {
    const outcome = resolveInboundChange({
      entityType: 'formulas',
      entityId: FORMULA,
      local: local({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['name'],
        entity: formulaEntity({ name: { fr: 'Math + Physique', ar: 'رياضيات + فيزياء' } }),
      }),
      inbound: inbound({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['active'],
        entity: formulaEntity({ active: false }),
      }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    expect(outcome.entity.name).toEqual({ fr: 'Math + Physique', ar: 'رياضيات + فيزياء' });
    expect(outcome.entity.active).toBe(false);
  });

  it('a formula priceMad edit on either side diverges', () => {
    const outcome = resolveInboundChange({
      entityType: 'formulas',
      entityId: FORMULA,
      local: local({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['priceMad'],
        entity: formulaEntity({ priceMad: 35000 }),
      }),
      inbound: inbound({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['priceMad'],
        entity: formulaEntity({ priceMad: 40000 }),
      }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
  });

  it('a formula active edit auto-merges, never diverges', () => {
    const outcome = resolveInboundChange({
      entityType: 'formulas',
      entityId: FORMULA,
      local: local({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['active'],
        entity: formulaEntity({ active: false }),
      }),
      inbound: inbound({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['name'],
        entity: formulaEntity({ name: { fr: 'Maths + Physique', ar: 'رياضيات + فيزياء' } }),
      }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    expect(outcome.entity.active).toBe(false);
    expect(outcome.entity.name).toEqual({ fr: 'Maths + Physique', ar: 'رياضيات + فيزياء' });
  });

  it('a teacher payout notes edit merges like ordinary data', () => {
    const outcome = resolveInboundChange({
      entityType: 'teacher_payouts',
      entityId: PAYOUT,
      local: local({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['notes'],
        entity: payoutEntity({ notes: 'called admin' }),
      }),
      inbound: inbound({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['notes'],
        entity: payoutEntity({ notes: 'called admin' }),
      }),
    });

    expect(outcome.kind).toBe('merged');
  });

  it('a same-field notes clash on a payout is a field-clash to a human, not divergence', () => {
    const outcome = resolveInboundChange({
      entityType: 'teacher_payouts',
      entityId: PAYOUT,
      local: local({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['notes'],
        entity: payoutEntity({ notes: 'called admin' }),
      }),
      inbound: inbound({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['notes'],
        entity: payoutEntity({ notes: 'prefers email' }),
      }),
    });

    expect(outcome.kind).toBe('conflict');
    if (outcome.kind !== 'conflict') return;
    expect(outcome.conflict.kind).toBe('field-clash');
  });

  it('a teacher payout amountMad edit diverges', () => {
    const outcome = resolveInboundChange({
      entityType: 'teacher_payouts',
      entityId: PAYOUT,
      local: local({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['amountMad'],
        entity: payoutEntity({ amountMad: 30000 }),
      }),
      inbound: inbound({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['amountMad'],
        entity: payoutEntity({ amountMad: 35000 }),
      }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
  });

  it('a teacher payout status edit diverges', () => {
    const outcome = resolveInboundChange({
      entityType: 'teacher_payouts',
      entityId: PAYOUT,
      local: local({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['status'],
        entity: payoutEntity({ status: 'paid' }),
      }),
      inbound: inbound({
        entityType: 'teacher_payouts',
        entityId: PAYOUT,
        changedFields: ['status'],
        entity: payoutEntity({ status: 'draft' }),
      }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
  });

  it('an invoice status edit diverges', () => {
    const outcome = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: local({ changedFields: ['status'], entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'issued' } }),
      inbound: inbound({ changedFields: ['status'], entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'draft' } }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
  });

  it('both sides editing DISJOINT protected fields on an immutable entity is divergence, not a silent merge', () => {
    const outcome = resolveInboundChange({
      entityType: 'invoices',
      entityId: INVOICE,
      local: local({ changedFields: ['status'], entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'issued' } }),
      inbound: inbound({ changedFields: ['issuedAt'], entity: { id: INVOICE, month: '2026-08', amount: 350, status: 'draft', issuedAt: new Date('2026-08-01T12:00:00Z') } }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
    if (outcome.kind !== 'immutable-divergence') return;
    expect(outcome.entityType).toBe('invoices');
    expect(outcome.entityId).toBe(INVOICE);
  });

  it('a disjoint protected + free edit diverges — a locked field was touched, never silently merged', () => {
    const outcome = resolveInboundChange({
      entityType: 'formulas',
      entityId: FORMULA,
      local: local({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['name'],
        entity: formulaEntity({ name: { fr: 'Math + Physique', ar: 'رياضيات + فيزياء' } }),
      }),
      inbound: inbound({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['priceMad'],
        entity: formulaEntity({ priceMad: 40000 }),
      }),
    });

    expect(outcome.kind).toBe('immutable-divergence');
  });

  it('a protected field changed to an IDENTICAL value on both sides is agreement, not divergence', () => {
    const outcome = resolveInboundChange({
      entityType: 'formulas',
      entityId: FORMULA,
      local: local({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['priceMad'],
        entity: formulaEntity({ priceMad: 35000 }),
      }),
      inbound: inbound({
        entityType: 'formulas',
        entityId: FORMULA,
        changedFields: ['priceMad'],
        entity: formulaEntity({ priceMad: 35000 }),
      }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    expect(outcome.entity.priceMad).toBe(35000);
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

  it('delete-vs-edit where the edit touches a protected field is divergence, never a popup choice', () => {
    const deletedMine = resolveInboundChange({
      entityType: 'teacher_payouts',
      entityId: PAYOUT,
      local: local({ entityType: 'teacher_payouts', entityId: PAYOUT, op: 'delete', changedFields: [], entity: { id: PAYOUT, deletedAt: '2026-08-01T09:00:00Z' } }),
      inbound: inbound({ entityType: 'teacher_payouts', entityId: PAYOUT, op: 'update', changedFields: ['amountMad'], entity: payoutEntity({ amountMad: 35000 }) }),
    });
    expect(deletedMine.kind).toBe('immutable-divergence');

    const editedMine = resolveInboundChange({
      entityType: 'teacher_payouts',
      entityId: PAYOUT,
      local: local({ entityType: 'teacher_payouts', entityId: PAYOUT, op: 'update', changedFields: ['amountMad'], entity: payoutEntity({ amountMad: 35000 }) }),
      inbound: inbound({ entityType: 'teacher_payouts', entityId: PAYOUT, op: 'delete', changedFields: [], entity: { id: PAYOUT, deletedAt: '2026-08-01T10:00:00Z' } }),
    });
    expect(editedMine.kind).toBe('immutable-divergence');
  });

  it('delete-vs-edit with only FREE fields edited falls through to the delete-vs-edit conflict', () => {
    const deletedMine = resolveInboundChange({
      entityType: 'teacher_payouts',
      entityId: PAYOUT,
      local: local({ entityType: 'teacher_payouts', entityId: PAYOUT, op: 'delete', changedFields: [], entity: { id: PAYOUT, deletedAt: '2026-08-01T09:00:00Z' } }),
      inbound: inbound({ entityType: 'teacher_payouts', entityId: PAYOUT, op: 'update', changedFields: ['notes'], entity: payoutEntity({ notes: 'called admin' }) }),
    });
    expect(deletedMine.kind).toBe('conflict');
    if (deletedMine.kind !== 'conflict') return;
    expect(deletedMine.conflict.kind).toBe('delete-vs-edit');
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

  it('every immutable entity type diverges on a protected-field edit', () => {
    const cases: ReadonlyArray<{ entityType: string; protectedField: string }> = [
      { entityType: 'invoices', protectedField: 'status' },
      { entityType: 'formulas', protectedField: 'priceMad' },
      { entityType: 'teacher_payouts', protectedField: 'amountMad' },
    ];
    for (const { entityType, protectedField } of cases) {
      const outcome = resolveInboundChange({
        entityType,
        entityId: INVOICE,
        local: local({ entityType, changedFields: [protectedField], entity: { id: INVOICE, [protectedField]: 100 } }),
        inbound: inbound({ entityType, changedFields: [protectedField], entity: { id: INVOICE, [protectedField]: 200 } }),
      });
      expect(outcome.kind, `${entityType}.${protectedField}`).toBe('immutable-divergence');
    }
  });

  it('the guard is wired to the real change-log entityType strings', () => {
    expect(isImmutableEntityType('invoices')).toBe(true);
    expect(isImmutableEntityType('formulas')).toBe(true);
    expect(isImmutableEntityType('teacher_payouts')).toBe(true);
    expect(isImmutableEntityType('teacher-payouts')).toBe(false);
  });
});
