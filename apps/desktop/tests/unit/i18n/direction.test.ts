import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, directionForLocale } from '../../../src/renderer/i18n/direction';

describe('directionForLocale', () => {
  it('is rtl for Arabic and ltr for everything else', () => {
    expect(directionForLocale('ar')).toBe('rtl');
    expect(directionForLocale('fr')).toBe('ltr');
    expect(directionForLocale('en')).toBe('ltr');
  });

  it('defaults to French', () => {
    expect(DEFAULT_LOCALE).toBe('fr');
  });
});
