import { describe, it, expect } from 'vitest';
import { foldSearchText } from '../../../src/policies/search-text-folding';

describe('foldSearchText', () => {
  it('lower-cases and strips Latin diacritics so accents never affect matching', () => {
    expect(foldSearchText('Éric')).toBe('eric');
    expect(foldSearchText('Benörî')).toBe('benori');
    expect(foldSearchText('ÀÇÉÈÊ')).toBe('aceee');
  });

  it('folds precomposed and decomposed forms of the same character alike', () => {
    const precomposed = 'é'; // U+00E9
    const decomposed = 'é'; // e + combining acute
    expect(foldSearchText(precomposed)).toBe(foldSearchText(decomposed));
    expect(foldSearchText(decomposed)).toBe('e');
  });

  it('leaves Arabic text unchanged (no combining Latin marks to strip)', () => {
    expect(foldSearchText('ياسين')).toBe('ياسين');
  });

  it('preserves spaces and inner punctuation so substrings still line up', () => {
    expect(foldSearchText('Éric Benörî')).toBe('eric benori');
  });
});
