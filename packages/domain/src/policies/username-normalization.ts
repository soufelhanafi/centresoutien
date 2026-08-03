/**
 * Normalizes an admin username for case-insensitive matching (SOU-153):
 * Unicode-normalize to NFC, trim, then lower-case. Deliberately not
 * `COLLATE NOCASE` — that's SQLite-specific and ASCII-only, so it would
 * mismatch accented usernames and wouldn't port to the future Postgres
 * backend. A pure domain function keeps the rule unit-testable and identical
 * on every adapter. `String.prototype.toLowerCase` is locale-invariant but
 * Unicode-aware, so accented Latin and Arabic casing (where applicable) fold
 * correctly without a diacritic-stripping pass — this is an exact-match key,
 * not the fuzzy `naturalKey` duplicate matcher. The NFC pass folds
 * precomposed and decomposed forms of the same accented character (e.g. 'É'
 * vs 'E' + combining acute) to one key, so which form an input method
 * produces at account creation vs login never causes a mismatch.
 */
export function normalizeUsername(username: string): string {
  return username.normalize('NFC').trim().toLowerCase();
}
