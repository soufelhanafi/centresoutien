import { describe, it, expect } from 'vitest';
import { normalizeSecurityAnswer } from '../../../src/policies/security-answer-normalization';

describe('normalizeSecurityAnswer', () => {
  it('lower-cases the answer', () => {
    expect(normalizeSecurityAnswer('Casablanca')).toBe('casablanca');
    expect(normalizeSecurityAnswer('CASABLANCA')).toBe('casablanca');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeSecurityAnswer('  Casablanca  ')).toBe('casablanca');
  });

  it('folds mixed accented Latin casing to the same key', () => {
    expect(normalizeSecurityAnswer('Émilie')).toBe(normalizeSecurityAnswer('émilie'));
  });

  it('produces the same normalized key across differently-cased/spaced duplicates', () => {
    const variants = ['Casablanca', 'casablanca', 'CASABLANCA', ' Casablanca '];
    const normalized = variants.map(normalizeSecurityAnswer);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('casablanca');
  });
});
