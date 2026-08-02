import type { CenterCode } from '../value-objects/ids';

/** One backup file on disk, as the {@link BackupPort} adapter sees it. */
export type BackupFileInfo = {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: Date;
};

/**
 * Result of opening a backup file with a candidate key before ever touching the
 * live database (SOU-102 acceptance: a corrupted/wrong-key backup fails safely).
 * SQLCipher cannot distinguish "wrong key" from "corrupted" until the first real
 * read of the file, so both are real, expected outcomes — never thrown as an
 * unhandled error.
 */
export type BackupVerification = { ok: true } | { ok: false; reason: 'not-found' | 'corrupted' | 'wrong-key' };

/**
 * Port for snapshotting, listing, pruning, and restoring the currently-open
 * center database's encrypted backup files. The concrete adapter (SQLCipher +
 * filesystem on desktop) lives outside the domain — mirrors the `Clock` /
 * `IdGenerator` port pattern. "USB" is just a folder the user picked; there is
 * no USB-specific enumeration here or in any adapter.
 */
export interface BackupPort {
  /** Snapshot the live database into `destDir` (created if missing), scoped to
   *  `centerCode` so a shared destination folder never mixes centers. */
  create(input: { destDir: string; centerCode: CenterCode }): Promise<BackupFileInfo>;

  /** List this center's backup files in `destDir`, newest first. Empty (not an
   *  error) when `destDir` doesn't exist yet. */
  list(input: { destDir: string; centerCode: CenterCode }): Promise<readonly BackupFileInfo[]>;

  /** Delete a backup file. Idempotent — a missing file is not an error. */
  remove(path: string): Promise<void>;

  /** Open `path` read-only with `key`, without touching the live database. */
  verify(path: string, key: string): Promise<BackupVerification>;

  /**
   * Replace the live database file with `path`'s contents. Callers MUST have
   * already gotten `{ ok: true }` from {@link verify} for this exact file — this
   * method does not re-verify. Implementations keep a `.pre-restore-*` safety
   * copy of the file they replace and only ever rename (never delete) it, so a
   * failure mid-restore leaves the current database recoverable. Closes the
   * live connection as part of the swap; the caller must not issue further
   * queries against it and must restart the app to reopen the restored file.
   */
  restore(path: string): Promise<void>;
}
