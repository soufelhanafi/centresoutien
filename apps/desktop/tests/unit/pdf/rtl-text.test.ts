import { describe, it, expect } from 'vitest';
import { toRtlVisualText } from '../../../src/data/pdf/rtl-text';

const ALEF_ISOLATED = 'ﺍ';
const BEH_ISOLATED = 'ﺏ';

describe('toRtlVisualText', () => {
  it('shapes standalone letters to their isolated presentation forms and reverses run order', () => {
    // Logical order "ALEF BEH" (2 single-letter words), both un-joined (space
    // neighbors), so each shapes to its isolated form; the whole RTL run then
    // reverses so BEH — read second — is stored first, matching how a real RTL
    // editor lays the line out left-to-right on the page.
    const result = toRtlVisualText('ا ب');
    expect(result).toBe(`${BEH_ISOLATED} ${ALEF_ISOLATED}`);
  });

  it('keeps an embedded digit run in its own left-to-right reading order', () => {
    const result = toRtlVisualText('رقم 123 محمد');
    // The digits are a weak/European-number run: they never get individually
    // reversed even though the surrounding Arabic run does.
    expect(result).toContain('123');
    expect(result).not.toContain('321');
  });

  it('returns an empty string unchanged', () => {
    expect(toRtlVisualText('')).toBe('');
  });

  it('leaves a string with no Arabic characters completely unchanged', () => {
    // A pure Latin/digit/punctuation string (an invoice id, a phone number) has
    // no RTL paragraph to resolve against — running it through the bidi pass
    // anyway reorders its neutral characters (spaces, dots) for no reason.
    const plain = 'inv_00000000000000000000000001 · +212 6 00 00 00 00';
    expect(toRtlVisualText(plain)).toBe(plain);
  });

  it('keeps a MAD-formatted amount readable: digits intact, currency suffix appended', () => {
    // Regression for a real bug found while building this renderer: a numeric
    // run at the very start of the string got fully reversed end-to-end
    // ("200,00 د.م." → "00,002 د.م.") because bidi-js resolves the "sor"
    // context for a leading EN run differently than a mid-string one. Assert
    // the digit substring survives intact regardless of position in the string.
    const result = toRtlVisualText('200,00 د.م.');
    expect(result).toContain('200,00');
  });

  it('shapes a joined word into Arabic Presentation Forms glyphs, not the bare base letters', () => {
    // "محمد" (Mohamed) — every codepoint must move into the Presentation Forms-B
    // block (U+FE70–U+FEFF) once shaped; the unshaped base letters (U+0600–U+06FF)
    // would render unjoined, which is what shaping exists to prevent.
    const result = toRtlVisualText('محمد');
    expect(result).toHaveLength(4);
    for (const ch of result) {
      const codePoint = ch.codePointAt(0) ?? 0;
      expect(codePoint).toBeGreaterThanOrEqual(0xfe70);
      expect(codePoint).toBeLessThanOrEqual(0xfeff);
    }
  });
});
