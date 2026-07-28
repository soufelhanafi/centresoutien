import { describe, expect, it } from 'vitest';
import fr from '../../../src/renderer/i18n/fr.json';
import ar from '../../../src/renderer/i18n/ar.json';

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatKeys(value as Record<string, unknown>, path)
      : [path];
  });
}

describe('i18n bundles', () => {
  it('FR and AR have identical key structure (no missing translations)', () => {
    expect(flatKeys(ar).sort()).toEqual(flatKeys(fr).sort());
  });
});
