/**
 * Normalizes a security-question answer before hashing/comparing (SOU-155),
 * mirroring `normalizeUsername` (SOU-153): Unicode-normalize to NFC, trim,
 * then lower-case. An answer typed with different spacing or casing at setup
 * vs. at reset time (e.g. "Casablanca" vs "casablanca ") must still match —
 * this is an exact-match key on the normalized form, not the fuzzy
 * `naturalKey` duplicate matcher.
 */
export function normalizeSecurityAnswer(answer: string): string {
  return answer.normalize('NFC').trim().toLowerCase();
}
