/**
 * SOU-302 — path of the sealed recovery blob that travels beside an encrypted
 * `.db` file. Single-sourced in the data layer so every caller (the escrow
 * writer, backup pruning, center discard, and the offline rekey CLI) derives the
 * `.db` → `.recovery` mapping identically and no orphan sibling is left behind.
 */
export const RECOVERY_BLOB_SUFFIX = '.recovery';

/**
 * e.g. `centre-<id>.db` → `centre-<id>.recovery` and
 * `backup-<code>_<ULID>.db` → `backup-<code>_<ULID>.recovery`.
 */
export function recoveryBlobPathFor(dbFilePath: string): string {
  const withoutDbSuffix = dbFilePath.endsWith('.db') ? dbFilePath.slice(0, -'.db'.length) : dbFilePath;
  return `${withoutDbSuffix}${RECOVERY_BLOB_SUFFIX}`;
}
