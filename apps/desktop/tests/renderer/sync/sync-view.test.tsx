import { describe, it, expect } from 'vitest';
import { groupConflicts } from './../../../src/renderer/lib/sync/sync-view';
import type { SyncConflictView } from '../../../src/renderer/lib/sync/sync-view';

const side = {
  updatedBy: 'usr_0000000000000000000000000A',
  deviceId: 'dev_0000000000000000000000000A',
  op: 'update' as const,
  changedFields: ['phone'],
  at: '2026-08-01T09:00:00Z',
  entity: { id: 'stu_00000000000000000000000001', phone: '0611111111' },
};

const fieldClash: SyncConflictView = {
  kind: 'field-clash',
  entityType: 'students',
  entityId: 'stu_00000000000000000000000001',
  version: 2,
  fields: ['phone'],
  mine: side,
  theirs: side,
};

const deleteVsEdit: SyncConflictView = {
  kind: 'delete-vs-edit',
  entityType: 'students',
  entityId: 'stu_00000000000000000000000001',
  version: 2,
  mine: side,
  theirs: { ...side, op: 'delete' },
};

const duplicate: SyncConflictView = {
  kind: 'probable-duplicate',
  entityType: 'parents',
  keptId: 'prt_00000000000000000000000001',
  candidateId: 'prt_00000000000000000000000002',
  tier: 'exact',
  reason: 'same-name-phone',
};

describe('groupConflicts', () => {
  it('splits conflicts into the three popup tabs', () => {
    const grouped = groupConflicts([fieldClash, deleteVsEdit, duplicate]);
    expect(grouped.fieldClashes).toEqual([fieldClash]);
    expect(grouped.deleteVsEdits).toEqual([deleteVsEdit]);
    expect(grouped.duplicates).toEqual([duplicate]);
  });

  it('handles an empty list', () => {
    expect(groupConflicts([])).toEqual({ fieldClashes: [], deleteVsEdits: [], duplicates: [] });
  });

  it('keeps same-kind conflicts grouped together', () => {
    const other: SyncConflictView = { ...fieldClash, entityId: 'stu_00000000000000000000000002' };
    const grouped = groupConflicts([fieldClash, other]);
    expect(grouped.fieldClashes).toHaveLength(2);
  });
});
