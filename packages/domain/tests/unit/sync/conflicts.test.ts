import { describe, it, expect } from 'vitest';
import { conflictKey, type DeleteVsEdit, type FieldClash, type ProbableDuplicate } from '../../../src/sync/conflicts';
import type { DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';

/**
 * Conflict identity — the engine de-duplicates repeated detections across
 * retries with `conflictKey`, so distinct conflicts must never share a key and
 * the same conflict (seen again on a re-pull) must always collide.
 */

const DEV = 'dev_0000000000000000000000000A' as DeviceId;
const USER = 'usr_0000000000000000000000000A' as UserId;
const S1 = 'stu_00000000000000000000000001' as EntityId;
const S2 = 'stu_00000000000000000000000002' as EntityId;

const side = {
  updatedBy: USER,
  deviceId: DEV,
  op: 'update' as const,
  seq: 1,
  at: new Date('2026-08-01T09:00:00Z'),
  changedFields: ['phone'],
  entity: { id: S1, phone: '0611111111' },
};

describe('conflictKey', () => {
  it('keys field clashes by type, entity, and the clashing fields', () => {
    const clash: FieldClash = { kind: 'field-clash', entityType: 'students', entityId: S1, version: 2, fields: ['phone'], mine: side, theirs: side };
    expect(conflictKey(clash)).toBe('field-clash:students:stu_00000000000000000000000001:phone');

    const sameAgain: FieldClash = { ...clash };
    expect(conflictKey(sameAgain)).toBe(conflictKey(clash));

    const otherEntity: FieldClash = { ...clash, entityId: S2 };
    expect(conflictKey(otherEntity)).not.toBe(conflictKey(clash));

    const otherFields: FieldClash = { ...clash, fields: ['address'] };
    expect(conflictKey(otherFields)).not.toBe(conflictKey(clash));
  });

  it('keys delete-vs-edit by type and entity (direction-independent — one tab)', () => {
    // theirs deleted, mine edited.
    const theirsDeleted: DeleteVsEdit = { kind: 'delete-vs-edit', entityType: 'students', entityId: S1, version: 2, mine: side, theirs: { ...side, op: 'delete' } };
    // mine deleted, theirs edited — the reversed conflict, same one tab.
    const mineDeleted: DeleteVsEdit = { ...theirsDeleted, mine: { ...side, op: 'delete' }, theirs: side };

    expect(conflictKey(theirsDeleted)).toBe('delete-vs-edit:students:stu_00000000000000000000000001');
    expect(conflictKey(mineDeleted)).toBe(conflictKey(theirsDeleted));
  });

  it('keys probable duplicates by type and the kept/candidate pair', () => {
    const duplicate: ProbableDuplicate = {
      kind: 'probable-duplicate',
      entityType: 'parents',
      keptId: S1,
      candidateId: S2,
      tier: 'exact',
      reason: 'same-name-phone',
    };
    expect(conflictKey(duplicate)).toBe('probable-duplicate:parents:stu_00000000000000000000000001:stu_00000000000000000000000002');
    expect(conflictKey({ ...duplicate, keptId: S2, candidateId: S1 })).not.toBe(conflictKey(duplicate));
  });
});
