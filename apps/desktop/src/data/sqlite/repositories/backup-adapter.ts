import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Database as DB } from 'better-sqlite3';
import type { IdGenerator, BackupPort, BackupFileInfo, BackupVerification, CenterCode } from '@centresoutien/domain';
import { hasIdPrefix } from '@centresoutien/domain';
import { backupDatabase } from '../migration-runner';
import { openDatabaseAt } from '../db';

/** Filenames this adapter creates and recognizes for a center: `backup-<centerCode>_<ULID>.db`. */
function backupPrefixFor(centerCode: CenterCode): string {
  return `backup-${centerCode}`;
}

function toFileInfo(destDir: string, fileName: string): BackupFileInfo {
  const path = join(destDir, fileName);
  const stats = statSync(path);
  return { fileName, path, sizeBytes: stats.size, createdAt: stats.mtime };
}

/**
 * SQLCipher/filesystem adapter for {@link BackupPort} (SOU-102). Reuses the
 * existing `backupDatabase` (WAL-checkpoint + encrypted byte copy, SOU-18) for
 * both the manual/scheduled snapshot and the restore-side copy — this adapter
 * only adds folder scanning, retention removal, and the safe verify/restore
 * dance around it.
 */
export class SqliteBackupAdapter implements BackupPort {
  constructor(
    private readonly db: DB,
    private readonly key: string,
    private readonly ids: IdGenerator,
    // SOU-302 — after a backup `.db` is written, emit its sealed recovery blob as
    // a sibling `.recovery` file so the DB key can be recovered offline together
    // with this exact copy. Optional so backup works unchanged when escrow is off.
    private readonly emitRecoverySibling?: (backupFilePath: string) => Promise<void>,
  ) {}

  async create({ destDir, centerCode }: { destDir: string; centerCode: CenterCode }): Promise<BackupFileInfo> {
    mkdirSync(destDir, { recursive: true });
    const fileName = `${this.ids.next(backupPrefixFor(centerCode))}.db`;
    const path = join(destDir, fileName);
    backupDatabase(this.db, path);
    await this.emitRecoverySibling?.(path);
    return toFileInfo(destDir, fileName);
  }

  async list({ destDir, centerCode }: { destDir: string; centerCode: CenterCode }): Promise<BackupFileInfo[]> {
    if (!existsSync(destDir)) return [];
    const prefix = backupPrefixFor(centerCode);
    // Sort by filename (embeds a monotonic ULID), not filesystem mtime: two
    // backups created back-to-back can land on the same mtime tick depending
    // on the filesystem's timestamp resolution, which made retention pruning
    // and `list()` ordering nondeterministic under fast, repeated calls.
    return readdirSync(destDir)
      .filter((name) => name.endsWith('.db') && hasIdPrefix(name.slice(0, -'.db'.length), prefix))
      .map((name) => toFileInfo(destDir, name))
      .sort((a, b) => b.fileName.localeCompare(a.fileName));
  }

  async remove(path: string): Promise<void> {
    try {
      unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async verify(path: string, key: string): Promise<BackupVerification> {
    if (!existsSync(path)) return { ok: false, reason: 'not-found' };
    let handle: DB | null = null;
    try {
      // Read-only — this must never mutate the backup file itself, which an
      // admin may later move or re-copy elsewhere. A WAL-mode source can still
      // make SQLite create transient -wal/-shm side files next to it even in
      // readonly mode; those are cleaned up in `finally` below.
      handle = new Database(path, { readonly: true, fileMustExist: true }) as unknown as DB;
      handle.pragma(`key = '${key.replace(/'/g, "''")}'`);
      // `quick_check` forces an actual page walk — SQLCipher cannot tell "wrong
      // key" from "corrupted" any earlier than this.
      handle.pragma('quick_check');
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const reason =
        message.includes('not a database') || message.includes('file is encrypted') ? 'wrong-key' : 'corrupted';
      return { ok: false, reason };
    } finally {
      handle?.close();
      this.removeSidecarFiles(path);
    }
  }

  /** Best-effort cleanup of the transient `-wal`/`-shm` files a readonly WAL
   *  open can create next to the backup file being verified. */
  private removeSidecarFiles(path: string): void {
    for (const suffix of ['-wal', '-shm']) {
      try {
        unlinkSync(`${path}${suffix}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }

  async restore(path: string): Promise<void> {
    const currentPath = this.db.name;
    // Reclaim safety copies from *previous* restores before creating this
    // one's — at most one `.pre-restore-*` (a full encrypted DB) sits on disk
    // at a time instead of growing forever. Unrelated to this restore's own
    // rollback net below, so it's safe even if this restore then fails.
    this.pruneSafetyCopies(currentPath);
    const safetyPath = `${currentPath}.pre-restore-${Date.now()}`;
    // Release the live handle before touching the file — required on Windows
    // (an open file can't be renamed) and harmless on macOS. Any repository
    // still holding this `db` reference is now unusable; the caller must
    // restart the app to get a fresh connection against the restored file.
    this.db.close();
    // Rename, never delete: if the copy below throws, the original file is
    // still on disk under `safetyPath` and gets renamed straight back — the
    // live DB is never destroyed (SOU-102 acceptance).
    renameSync(currentPath, safetyPath);
    let handle: DB | null = null;
    try {
      handle = openDatabaseAt(path, this.key);
      backupDatabase(handle, currentPath);
    } catch (error) {
      renameSync(safetyPath, currentPath);
      throw error;
    } finally {
      handle?.close();
    }
  }

  /** Best-effort removal of `.pre-restore-*` copies left by earlier restores —
   *  they contain full, encrypted personal data (loi 09-08), so they must not
   *  accumulate forever. */
  private pruneSafetyCopies(currentPath: string): void {
    const dir = dirname(currentPath);
    if (!existsSync(dir)) return;
    const prefix = `${basename(currentPath)}.pre-restore-`;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(prefix)) continue;
      try {
        unlinkSync(join(dir, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}
