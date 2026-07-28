import { describe, expect, it } from 'vitest';
import { hasIdPrefix, isUlid } from '@centresoutien/domain';
import { UlidIdGenerator } from '../../../src/main/infra/ulid-id-generator';

describe('UlidIdGenerator', () => {
  const gen = new UlidIdGenerator();

  it('emits a prefixed, valid ULID the domain accepts', () => {
    const id = gen.next('stu');
    expect(hasIdPrefix(id, 'stu')).toBe(true);
    expect(isUlid(id.slice('stu_'.length))).toBe(true);
  });

  it('emits unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => gen.next('tch')));
    expect(ids.size).toBe(1000);
  });
});
