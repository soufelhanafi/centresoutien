import { ArabicShaper } from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

// Arabic (U+0600–U+06FF), Arabic Supplement (U+0750–U+077F), and Arabic
// Presentation Forms A/B (U+FB50–U+FDFF, U+FE70–U+FEFF) — everything
// `ArabicShaper` can consume or produce. Checked by codepoint, not a regex
// character class, so no literal Arabic appears in source (matches the
// `isCombiningMark` pattern in `list-students.ts`).
function isArabicCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  );
}

function containsArabic(text: string): boolean {
  return [...text].some((ch) => isArabicCodePoint(ch.codePointAt(0) ?? 0));
}

/**
 * Prepares Arabic (or mixed Arabic/Latin/digit) text for `pdf-lib`'s `drawText`,
 * which always places glyphs left-to-right at increasing x in the order given —
 * it has no concept of RTL. Two passes:
 *
 * 1. **Shape**: join each Arabic letter to its contextual (isolated/initial/
 *    medial/final) presentation-form glyph, in logical (reading) order — joining
 *    depends on the *original* neighbor, so this must run before reordering.
 * 2. **Reorder**: apply the Unicode Bidi Algorithm to convert logical order to
 *    *visual* order — an Arabic run reverses, while an embedded LTR run (a MAD
 *    amount, an invoice id) keeps its internal digit/Latin order, exactly like a
 *    real RTL word processor.
 *
 * The renderer then draws the result normally and right-aligns it in its layout
 * box — no per-character logic needed at the call site.
 *
 * A string with **no** Arabic characters at all (an invoice id, a phone
 * number, a plain `YYYY-MM` month) is returned unchanged: forcing a purely
 * Latin/numeric string through an RTL-based bidi pass reorders its neutral
 * characters (spaces, punctuation) for no reason — there is no RTL paragraph
 * to resolve against, only the AR page layout's right-aligned anchor, which
 * `InvoicePdfWriter` already handles independently of character order.
 */
export function toRtlVisualText(text: string): string {
  if (!containsArabic(text)) return text;
  const shaped = ArabicShaper.convertArabic(text);
  const embeddingLevels = bidi.getEmbeddingLevels(shaped, 'rtl');
  return bidi.getReorderedString(shaped, embeddingLevels);
}
