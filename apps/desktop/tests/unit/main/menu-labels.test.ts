import { describe, expect, it } from 'vitest';
import { menuLabelsFor } from '../../../src/main/menu-labels';

describe('menuLabelsFor', () => {
  it('returns Arabic labels for the ar locale', () => {
    expect(menuLabelsFor('ar')).toEqual({
      view: 'عرض',
      reload: 'إعادة التحميل',
      forceReload: 'فرض إعادة التحميل',
    });
  });

  it('returns French labels for the fr locale', () => {
    expect(menuLabelsFor('fr').reload).toBe('Recharger');
  });

  it('falls back to French for an unresolved locale', () => {
    expect(menuLabelsFor(undefined).reload).toBe('Recharger');
  });
});
