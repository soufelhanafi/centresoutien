import { describe, expect, it } from 'vitest';
import { diffChangedFields } from '../../../src/sync/change-log';

type Row = {
  id: string;
  // envelope-ish bookkeeping that must never be reported as a domain change
  updatedAt: Date;
  version: number;
  // domain fields
  fullName: string;
  level: string;
  parentIds: readonly string[];
};

const base: Row = {
  id: 'stu_1',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  version: 0,
  fullName: 'Ahmed Benali',
  level: '3AC',
  parentIds: ['prt_1'],
};

describe('diffChangedFields', () => {
  it('returns only the domain fields whose value actually changed', () => {
    const next: Row = { ...base, level: '4AC' };
    expect(diffChangedFields(base, next)).toEqual(['level']);
  });

  it('returns an empty array when nothing changed', () => {
    expect(diffChangedFields(base, { ...base })).toEqual([]);
  });

  it('ignores envelope bookkeeping fields (id, updatedAt, version)', () => {
    const next: Row = { ...base, updatedAt: new Date('2027-01-01T00:00:00Z'), version: 9 };
    expect(diffChangedFields(base, next)).toEqual([]);
  });

  it('compares arrays by value and order', () => {
    expect(diffChangedFields(base, { ...base, parentIds: ['prt_1'] })).toEqual([]);
    expect(diffChangedFields(base, { ...base, parentIds: ['prt_2'] })).toEqual(['parentIds']);
    expect(diffChangedFields(base, { ...base, parentIds: ['prt_1', 'prt_2'] })).toEqual(['parentIds']);
  });

  it('treats equal Date instances as unchanged', () => {
    const next: Row = { ...base, updatedAt: new Date('2026-01-01T00:00:00Z') };
    expect(diffChangedFields(base, next)).toEqual([]);
  });

  it('compares nested plain objects by value', () => {
    type WithMeta = { id: string; version: number; meta: { a: number; b?: number } };
    const a: WithMeta = { id: 'x', version: 0, meta: { a: 1, b: 2 } };
    expect(diffChangedFields(a, { ...a, meta: { a: 1, b: 2 } })).toEqual([]);
    expect(diffChangedFields(a, { ...a, meta: { a: 1, b: 3 } })).toEqual(['meta']);
    expect(diffChangedFields(a, { ...a, meta: { a: 1 } })).toEqual(['meta']); // fewer keys
  });
});
