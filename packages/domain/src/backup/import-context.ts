import { BACKUP_SHEETS, type BackupSheetName, type BackupWorkbook } from './backup-workbook';
import { classifyImportRow, normalizeBackupRow } from './classify-rows';
import type { ClassifiedRow } from './resolve-references';
import type { BackupExcelPort } from '../ports/backup-excel-port';
import type { BackupStore } from '../ports/backup-store';
import type { CenterCode } from '../value-objects/ids';
import { BackupFileReadError } from '../errors/backup-errors';

/** Existing rows of one sheet, indexed for import classification. */
export type ExistingSheetIndex = {
  ids: ReadonlySet<string>;
  /** naturalKeys of live (non-tombstoned) rows only — a tombstone must not
   *  block recreating the same person. */
  naturalKeys: ReadonlySet<string>;
};

/**
 * Read every sheet's existing rows once and index them by id + live naturalKey,
 * so preview and apply classify every workbook row against a single snapshot of
 * the DB (KICKOFF: preview and apply can never disagree).
 */
export async function buildExistingIndex(store: BackupStore): Promise<Map<BackupSheetName, ExistingSheetIndex>> {
  const index = new Map<BackupSheetName, ExistingSheetIndex>();
  for (const spec of BACKUP_SHEETS) {
    const rows = await store.readAllRows(spec.name);
    const ids = new Set<string>();
    const naturalKeys = new Set<string>();
    for (const row of rows) {
      if (typeof row['id'] === 'string' && row['id'].length > 0) ids.add(row['id']);
      const naturalKeyColumn = spec.naturalKeyColumn ?? 'naturalKey';
      const naturalKey = row[naturalKeyColumn];
      if (typeof naturalKey === 'string' && naturalKey.length > 0 && row['deletedAt'] === null) {
        naturalKeys.add(naturalKey);
      }
    }
    index.set(spec.name, { ids, naturalKeys });
  }
  return index;
}

export type ClassifiedWorkbook = {
  classifiedBySheet: ReadonlyMap<BackupSheetName, readonly ClassifiedRow[]>;
  /** Final known-id set per sheet: existing DB rows union every row this
   *  workbook classifies `created`/`updated` — what {@link resolveWorkbookReferences}
   *  treats as "will exist" once this import applies. */
  knownIdsBySheet: ReadonlyMap<BackupSheetName, ReadonlySet<string>>;
};

/**
 * Classify every row of every known sheet against the center's existing rows,
 * exactly once — the shared core of `PreviewImportBackup` and
 * `ApplyImportBackup` (KICKOFF: preview and apply can never disagree). Unknown
 * sheets aren't classified here; the caller detects those separately by
 * diffing `workbook.sheets` against the sheets this returns.
 */
export function classifyWorkbook(
  workbook: BackupWorkbook,
  existing: ReadonlyMap<BackupSheetName, ExistingSheetIndex>,
  centerCode: CenterCode,
): ClassifiedWorkbook {
  const byName = new Map(workbook.sheets.map((sheet) => [sheet.name, sheet]));
  const classifiedBySheet = new Map<BackupSheetName, ClassifiedRow[]>();
  const knownIdsBySheet = new Map<BackupSheetName, ReadonlySet<string>>();

  for (const spec of BACKUP_SHEETS) {
    const sheet = byName.get(spec.name);
    if (sheet === undefined) continue;

    const index = existing.get(spec.name);
    const knownIds = new Set(index?.ids ?? EMPTY_IDS);
    const knownNaturalKeys = new Set(index?.naturalKeys ?? EMPTY_IDS);
    const classified: ClassifiedRow[] = [];

    for (const row of sheet.rows) {
      const normalizedRow = normalizeBackupRow(spec, row);
      const classification = classifyImportRow({
        spec,
        row: normalizedRow,
        existingIds: knownIds,
        existingNaturalKeys: knownNaturalKeys,
        centerCode,
      });
      if (classification.status === 'created' || classification.status === 'updated') {
        if (typeof normalizedRow['id'] === 'string') knownIds.add(normalizedRow['id']);
        const naturalKeyColumn = spec.naturalKeyColumn ?? 'naturalKey';
        const naturalKey = normalizedRow[naturalKeyColumn];
        if (typeof naturalKey === 'string' && naturalKey.length > 0) knownNaturalKeys.add(naturalKey);
      }
      classified.push({ row: normalizedRow, status: classification.status, reason: classification.reason });
    }

    classifiedBySheet.set(spec.name, classified);
    knownIdsBySheet.set(spec.name, knownIds);
  }

  return { classifiedBySheet, knownIdsBySheet };
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** Read a workbook, wrapping adapter failures in the stable domain error. */
export async function readBackupWorkbook(
  excel: BackupExcelPort,
  path: string,
): Promise<BackupWorkbook> {
  try {
    return await excel.readWorkbook(path);
  } catch (error) {
    if (error instanceof BackupFileReadError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new BackupFileReadError(path, detail);
  }
}
