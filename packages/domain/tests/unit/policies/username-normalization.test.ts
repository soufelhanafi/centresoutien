import { describe, it, expect } from 'vitest';
import { normalizeUsername } from '../../../src/policies/username-normalization';

describe('normalizeUsername', () => {
  it('lower-cases the username', () => {
    expect(normalizeUsername('Directrice')).toBe('directrice');
    expect(normalizeUsername('DIRECTRICE')).toBe('directrice');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeUsername('  directrice  ')).toBe('directrice');
  });

  it('folds mixed accented Latin casing to the same key', () => {
    expect(normalizeUsername('Émilie')).toBe(normalizeUsername('émilie'));
    expect(normalizeUsername('ÉMILIE')).toBe(normalizeUsername('émilie'));
  });

  it('produces the same normalized key across differently-cased duplicates', () => {
    const variants = ['LowerCase', 'lowercase', 'LOWERCASE', ' LowerCase '];
    const normalized = variants.map(normalizeUsername);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('lowercase');
  });
});
