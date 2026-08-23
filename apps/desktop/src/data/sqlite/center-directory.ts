import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import { centreDbFileName, openDatabaseAt } from './db';

/**
 * One center as it appears in the app-shell switcher (SOU-96). `centreId` is the
 * per-center DB-file discriminator parsed from `centre-{centreId}.db`; `isActive`
 * marks the center whose DB is currently open. The switcher never merges rows
 * across centers — each field here comes from that one center's own file.
 */
export type CenterSummary = {
  centreId: string;
  centerCode: string;
  displayName: string;
  isActive: boolean;
};

/** Resolves the per-center SQLCipher key for a `centreId` (SOU-179 keychain HKDF). */
export type CenterKeyProvider = (centreId: string) => string;

/** `centre-{centreId}.db` — the business DB per center. Excludes `-wal` / `-shm`
 *  sidecars and the `hub-{centreId}.db` canonical store (a different prefix). */
const CENTRE_DB_FILE = /^centre-(.+)\.db$/;

/**
 * The installed `centreId`s on this machine — every `centre-*.db` in `dir` minus
 * the explicit `excludeCentreIds`. The one fs-scan the center switcher (SOU-96)
 * and the multi-center stats aggregation (SOU-106) share, so a DB the switcher
 * lists is exactly a DB the stats read enumerates.
 */
export function scanInstalledCentreIds(
  dir: string,
  excludeCentreIds: readonly string[] = [],
): string[] {
  const ids: string[] = [];
  for (const file of readdirSync(dir)) {
    const centreId = CENTRE_DB_FILE.exec(file)?.[1];
    if (centreId === undefined) continue;
    if (excludeCentreIds.includes(centreId)) continue;
    ids.push(centreId);
  }
  return ids;
}

/**
 * Discovers the centers installed on this machine by scanning the userData dir
 * for `centre-*.db` files (SOU-96). The center list has no domain entity — there
 * is no Membership/Organization store on desktop — so this is a data-layer fs +
 * SQLCipher adapter, never a domain concern.
 *
 * Tenant isolation (CLAUDE.md §5ter): each file is opened on its own, only the
 * two columns the switcher needs are read (`center_code`, `name`), and the handle
 * is closed immediately — no two center DBs are ever open together and no rows
 * are merged. A file that will not open with its derived key, or predates the
 * `center` table, degrades to a `centreId`-based fallback rather than throwing.
 */
export class FsCenterDirectory {
  constructor(
    private readonly dir: string,
    private readonly keyFor: CenterKeyProvider,
    private readonly excludeCentreIds: readonly string[] = [],
  ) {}

  list(activeCentreId: string): CenterSummary[] {
    const summaries: CenterSummary[] = [];
    for (const centreId of scanInstalledCentreIds(this.dir, this.excludeCentreIds)) {
      const profile = this.peek(centreId);
      const centerCode = profile?.centerCode ?? centreId;
      summaries.push({
        centreId,
        centerCode,
        displayName: profile?.displayName ?? centerCode,
        isActive: centreId === activeCentreId,
      });
    }
    return summaries.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Read-only peek of one center's tenant code + display name, used by the switch
   * factory to resolve the target's `centerCode` before opening a full container.
   * Returns `null` when the file cannot be opened or has no profile row yet.
   */
  peek(centreId: string): { centerCode: string; displayName: string } | null {
    let db: DB | null = null;
    try {
      db = openDatabaseAt(join(this.dir, centreDbFileName(centreId)), this.keyFor(centreId));
      const row = db
        .prepare("SELECT center_code AS centerCode, name FROM center WHERE deleted_at IS NULL LIMIT 1")
        .get() as { centerCode: string; name: string } | undefined;
      if (!row) return null;
      const name = row.name.trim();
      return { centerCode: row.centerCode, displayName: name.length > 0 ? name : row.centerCode };
    } catch {
      return null;
    } finally {
      db?.close();
    }
  }
}
