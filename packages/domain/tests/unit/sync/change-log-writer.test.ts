import { describe, expect, it } from 'vitest';
import { resolveChangeLogOp } from '../../../src/sync/change-log-writer';

describe('resolveChangeLogOp', () => {
  it('resolves an upsert on the first revision to create', () => {
    expect(resolveChangeLogOp('upsert', 1)).toBe('create');
  });

  it('resolves an upsert on a later revision to update', () => {
    expect(resolveChangeLogOp('upsert', 2)).toBe('update');
    expect(resolveChangeLogOp('upsert', 17)).toBe('update');
  });

  it('resolves a delete intent to delete regardless of revision', () => {
    expect(resolveChangeLogOp('delete', 1)).toBe('delete');
    expect(resolveChangeLogOp('delete', 5)).toBe('delete');
  });
});
