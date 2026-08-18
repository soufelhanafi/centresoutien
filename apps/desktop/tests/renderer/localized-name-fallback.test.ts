import { describe, expect, it } from 'vitest';
import { pickLocalized, localizedSubjectName } from '../../src/renderer/lib/subjects/localized-name';
import { localizedFormulaName } from '../../src/renderer/lib/formulas/localized-name';
import { localizedNiveauName } from '../../src/renderer/lib/niveaux/niveau-view';
import { localizedName } from '../../src/renderer/lib/groups/localized-name';

/**
 * SOU-271 — the Arabic side of a bilingual name may be empty (FR-only data entry).
 * Single-label display surfaces (pickers, chips, selects, menus) must stay identifiable,
 * so every localizer falls back to French when the active-locale value is empty —
 * without ever mutating the persisted `name.ar`.
 */
describe('localized-name fallback (SOU-271)', () => {
  const withArabic = { fr: 'Mathématiques', ar: 'الرياضيات' };
  const frOnly = { fr: 'Mathématiques', ar: '' };

  it('returns the Arabic value in AR locale when present', () => {
    expect(pickLocalized(withArabic, 'ar')).toBe('الرياضيات');
    expect(localizedSubjectName(withArabic, 'ar')).toBe('الرياضيات');
    expect(localizedFormulaName(withArabic, 'ar')).toBe('الرياضيات');
    expect(localizedNiveauName(withArabic, 'ar')).toBe('الرياضيات');
    expect(localizedName(withArabic, 'ar')).toBe('الرياضيات');
  });

  it('falls back to French in AR locale when the Arabic value is empty', () => {
    expect(pickLocalized(frOnly, 'ar')).toBe('Mathématiques');
    expect(localizedSubjectName(frOnly, 'ar')).toBe('Mathématiques');
    expect(localizedFormulaName(frOnly, 'ar')).toBe('Mathématiques');
    expect(localizedNiveauName(frOnly, 'ar')).toBe('Mathématiques');
    expect(localizedName(frOnly, 'ar')).toBe('Mathématiques');
  });

  it('returns French in FR locale regardless of the Arabic value', () => {
    expect(pickLocalized(frOnly, 'fr')).toBe('Mathématiques');
    expect(localizedSubjectName(withArabic, 'fr')).toBe('Mathématiques');
  });
});
