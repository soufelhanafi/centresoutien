/**
 * Folds text for diacritic-insensitive substring search (SOU-200): Unicode-normalize
 * to NFD, strip combining marks, then lower-case. So "Éric" and "eric" fold to the
 * same key, and an Arabic name folds unchanged (Arabic has no combining Latin marks).
 *
 * Deliberately NOT SQLite `LOWER()` / `COLLATE NOCASE` — both are ASCII-only, so they
 * miss accented Latin names and would not port to the future Postgres backend. A pure
 * domain function keeps the rule unit-testable and lets the SQLite adapter register it
 * as a UDF (`nfd_fold`), guaranteeing the stored column and the query term fold
 * identically. Distinct from {@link normalizeUsername}: that is an exact-match key that
 * KEEPS diacritics (NFC); this is the fuzzy search fold that STRIPS them.
 */
export function foldSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
