/**
 * Normalizes an admin username for case-insensitive matching (SOU-153): trim,
 * then lower-case. Deliberately not `COLLATE NOCASE` — that's SQLite-specific
 * and ASCII-only, so it would mismatch accented usernames and wouldn't port to
 * the future Postgres backend. A pure domain function keeps the rule
 * unit-testable and identical on every adapter. `String.prototype.toLowerCase`
 * is locale-invariant but Unicode-aware, so accented Latin and Arabic casing
 * (where applicable) fold correctly without a diacritic-stripping pass — this
 * is an exact-match key, not the fuzzy `naturalKey` duplicate matcher.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
