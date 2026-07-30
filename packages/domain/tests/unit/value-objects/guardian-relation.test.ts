import { describe, it, expect } from 'vitest';
import {
  GUARDIAN_RELATIONS,
  isGuardianRelation,
} from '../../../src/value-objects/guardian-relation';

describe('GuardianRelation', () => {
  it('is the closed FR/AR-agnostic token set', () => {
    expect([...GUARDIAN_RELATIONS]).toEqual(['pere', 'mere', 'tuteur', 'autre']);
  });

  it.each(GUARDIAN_RELATIONS)('accepts the known token %s', (token) => {
    expect(isGuardianRelation(token)).toBe(true);
  });

  it.each(['oncle', 'Pere', 'father', '', ' pere '])('rejects the unknown token %j', (token) => {
    expect(isGuardianRelation(token)).toBe(false);
  });
});
