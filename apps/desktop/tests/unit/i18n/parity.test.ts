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

// i18next plural suffixes (v4 / CLDR). Each language supplies only the plural
// categories its grammar uses — FR needs `_one`/`_other`, AR the full set
// (`_zero`…`_other`) — so comparing raw keys would wrongly flag that legitimate
// asymmetry. We compare on the base key (suffix stripped); a genuinely missing
// translation still shows up as a differing base key.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseKeys = (obj: Record<string, unknown>): string[] =>
  [...new Set(flatKeys(obj).map((key) => key.replace(PLURAL_SUFFIX, '')))].sort();

describe('i18n bundles', () => {
  it('FR and AR have identical key structure (no missing translations)', () => {
    expect(baseKeys(ar)).toEqual(baseKeys(fr));
  });
});
