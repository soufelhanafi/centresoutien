// Minimal ambient types for two small, dependency-light vendor packages used only
// by the invoice PDF renderer — neither ships its own TypeScript definitions.

declare module 'arabic-persian-reshaper' {
  type ArabicShaperApi = {
    /** Reshapes each Arabic letter to its contextual (isolated/initial/medial/final)
     *  presentation form. Non-Arabic characters pass through unchanged, in place. */
    convertArabic(input: string): string;
  };

  const reshaper: { ArabicShaper: ArabicShaperApi };
  export default reshaper;
}

declare module 'bidi-js' {
  export type BidiEmbeddingLevels = {
    levels: Uint8Array;
    paragraphs: readonly { start: number; end: number; level: number }[];
  };

  export type Bidi = {
    getEmbeddingLevels(text: string, explicitDirection?: 'ltr' | 'rtl'): BidiEmbeddingLevels;
    /** Reorders `text` into visual order per the Unicode Bidi Algorithm, also
     *  swapping mirrored characters (e.g. parentheses) within RTL runs. */
    getReorderedString(
      text: string,
      embeddingLevels: BidiEmbeddingLevels,
      start?: number,
      end?: number,
    ): string;
  };

  export default function bidiFactory(): Bidi;
}
