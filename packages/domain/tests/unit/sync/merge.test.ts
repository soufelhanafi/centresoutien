import { describe, it, expect } from 'vitest';
import { resolveInboundChange } from '../../../src/sync/merge';
import type { HubChange, LocalChange } from '../../../src/ports/sync-hub-port';
import type { DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';

/**
 * The resolve step is pure: three-way field merge keyed on each side's change
 * log. Disjoint fields auto-merge silently; same-field clashes and
 * delete-vs-edit go to a human; the device with no edit simply fast-forwards.
 * (SOU-80 §3.)
 */

const DEV_A = 'dev_0000000000000000000000000A' as DeviceId;
const DEV_B = 'dev_0000000000000000000000000B' as DeviceId;
const USER_A = 'usr_0000000000000000000000000A' as UserId;
const USER_B = 'usr_0000000000000000000000000B' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as EntityId;

function local(overrides: Partial<LocalChange>): LocalChange {
  return {
    entityType: 'students',
    entityId: STUDENT,
    deviceId: DEV_A,
    baseVersion: 1,
    op: 'update',
    entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '2 Bac' },
    changedFields: [],
    seq: 2,
    at: new Date('2026-08-01T09:00:00Z'),
    updatedBy: USER_A,
    ...overrides,
  };
}

function inbound(overrides: Partial<HubChange>): HubChange {
  return {
    entityType: 'students',
    entityId: STUDENT,
    version: 2,
    op: 'update',
    entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '2 Bac' },
    changedFields: [],
    deviceId: DEV_B,
    updatedBy: USER_B,
    deviceSeq: 1,
    receivedAt: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  };
}

describe('resolveInboundChange', () => {
  it('fast-forwards when the device has no edit on the entity', () => {
    const inboundChange = inbound({ version: 3, entity: { id: STUDENT, name: 'Yassine', level: '3AC' } });
    const outcome = resolveInboundChange({ entityType: 'students', entityId: STUDENT, local: null, inbound: inboundChange });

    expect(outcome.kind).toBe('apply');
    if (outcome.kind !== 'apply') return;
    expect(outcome.version).toBe(3);
    expect(outcome.entity).toEqual(inboundChange.entity);
  });

  it('auto-merges disjoint field changes, keeping each side’s value', () => {
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ changedFields: ['phone'], entity: { id: STUDENT, name: 'Yassine', phone: '0666666666', level: '2 Bac' } }),
      inbound: inbound({ changedFields: ['level'], entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '1 Bac' } }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    // Phone from mine, level from theirs — both survived, nobody asked a human.
    expect(outcome.entity.phone).toBe('0666666666');
    expect(outcome.entity.level).toBe('1 Bac');
    expect(outcome.changedFields).toEqual(['phone', 'level']);
    expect(outcome.baseVersion).toBe(2);
  });

  it('treats same-field changes to the SAME value as clean (no popup)', () => {
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ changedFields: ['level'], entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '1 Bac' } }),
      inbound: inbound({ changedFields: ['level'], entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '1 Bac' } }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    expect(outcome.entity.level).toBe('1 Bac');
  });

  it('routes a same-field clash to a human — nothing auto-resolved', () => {
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ changedFields: ['phone'], entity: { id: STUDENT, name: 'Yassine', phone: '0666666666', level: '2 Bac' } }),
      inbound: inbound({ changedFields: ['phone'], entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '2 Bac' } }),
    });

    expect(outcome.kind).toBe('conflict');
    if (outcome.kind !== 'conflict') return;
    expect(outcome.conflict.kind).toBe('field-clash');
    if (outcome.conflict.kind !== 'field-clash') return;
    expect(outcome.conflict.fields).toEqual(['phone']);
    expect(outcome.conflict.mine.updatedBy).toBe(USER_A);
    expect(outcome.conflict.mine.entity.phone).toBe('0666666666');
    expect(outcome.conflict.theirs.updatedBy).toBe(USER_B);
    expect(outcome.conflict.theirs.entity.phone).toBe('0611111111');
  });

  it('never auto-resolves delete-vs-edit in EITHER direction', () => {
    // Mine deleted, theirs edited.
    const deletedMine = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ op: 'delete', changedFields: [], entity: { id: STUDENT, name: 'Yassine', deletedAt: '2026-08-01T09:00:00Z' } }),
      inbound: inbound({ op: 'update', changedFields: ['level'], entity: { id: STUDENT, name: 'Yassine', level: '1 Bac' } }),
    });
    expect(deletedMine.kind).toBe('conflict');
    if (deletedMine.kind !== 'conflict') return;
    expect(deletedMine.conflict.kind).toBe('delete-vs-edit');
    expect(deletedMine.conflict.mine.op).toBe('delete');
    expect(deletedMine.conflict.theirs.op).toBe('update');

    // Theirs deleted, mine edited.
    const editedMine = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ op: 'update', changedFields: ['level'], entity: { id: STUDENT, name: 'Yassine', level: '1 Bac' } }),
      inbound: inbound({ op: 'delete', changedFields: [], entity: { id: STUDENT, name: 'Yassine', deletedAt: '2026-08-01T10:00:00Z' } }),
    });
    expect(editedMine.kind).toBe('conflict');
    if (editedMine.kind !== 'conflict') return;
    expect(editedMine.conflict.kind).toBe('delete-vs-edit');
    expect(editedMine.conflict.mine.op).toBe('update');
    expect(editedMine.conflict.theirs.op).toBe('delete');
  });

  it('never lets the inbound write stamp the envelope version through the merge', () => {
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ changedFields: ['phone'], entity: { id: STUDENT, name: 'Yassine', phone: '0666666666', level: '2 Bac', version: 1 } }),
      inbound: inbound({ changedFields: ['version', 'level'], entity: { id: STUDENT, name: 'Yassine', phone: '0611111111', level: '1 Bac', version: 99 } }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    // The envelope version is the engine's to assign, never the wire's.
    expect(outcome.entity.version).toBe(1);
    expect(outcome.entity.level).toBe('1 Bac');
  });

  it('never raises a clash on the envelope version, even when BOTH sides list it', () => {
    // Regression: envelope fields are engine-managed, so even a hostile/invalid
    // change log that lists `version` on both sides must merge cleanly — the
    // clash detector filters envelope fields out before comparing values.
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ changedFields: ['version', 'phone'], entity: { id: STUDENT, phone: '0666666666', version: 1 } }),
      inbound: inbound({ changedFields: ['version', 'level'], entity: { id: STUDENT, level: '1 Bac', version: 99 } }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    expect(outcome.entity.version).toBe(1); // engine-assigned base, not 99
    expect(outcome.entity.phone).toBe('0666666666');
    expect(outcome.entity.level).toBe('1 Bac');
    expect(outcome.changedFields).toEqual(['phone', 'level']); // envelope excluded
  });

  it('never lets wire field names pollute the merged object prototype', () => {
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ changedFields: ['phone'], entity: { id: STUDENT, phone: '0666666666' } }),
      // A hostile/invalid change log names prototype-sensitive keys.
      inbound: inbound({
        changedFields: ['__proto__', 'constructor', 'prototype'],
        entity: Object.assign({ id: STUDENT, phone: '0666666666' }, { ['__proto__']: { polluted: true }, constructor: 'evil', prototype: 'evil' }),
      }),
    });

    expect(outcome.kind).toBe('merged');
    if (outcome.kind !== 'merged') return;
    expect(Object.getPrototypeOf(outcome.entity)).toBe(Object.prototype);
    expect((outcome.entity as { polluted?: unknown }).polluted).toBeUndefined();
    expect(outcome.entity.constructor).not.toBe('evil');
    expect(outcome.entity.phone).toBe('0666666666'); // domain fields merge as usual
  });

  it('both deleted is agreement, not a conflict — takes the canonical tombstone', () => {
    const outcome = resolveInboundChange({
      entityType: 'students',
      entityId: STUDENT,
      local: local({ op: 'delete', changedFields: [], entity: { id: STUDENT, name: 'Yassine', deletedAt: '2026-08-01T09:00:00Z' } }),
      inbound: inbound({ op: 'delete', changedFields: [], entity: { id: STUDENT, name: 'Yassine', deletedAt: '2026-08-01T10:00:00Z' } }),
    });

    expect(outcome.kind).toBe('apply');
    if (outcome.kind !== 'apply') return;
    expect(outcome.entity.deletedAt).toBe('2026-08-01T10:00:00Z');
  });
});
