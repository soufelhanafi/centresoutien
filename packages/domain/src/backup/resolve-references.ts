import type { BackupRow, BackupSheetName, BackupSheetSpec } from './backup-workbook';
import { findBackupSheet } from './backup-workbook';
import { hasDeterministicIdPrefix, hasIdPrefix } from '../value-objects/ids';
import type { ImportRowStatus } from './classify-rows';

/** One row already classified by {@link classifyImportRow}, in workbook order.
 *  `reason` rides along unused by this module — callers keep it on the same
 *  record so the final report can carry it forward for rows this module
 *  doesn't touch. */
export type ClassifiedRow = { row: BackupRow; status: ImportRowStatus; reason: string | null };

/** A catalog id referenced from elsewhere in the workbook but missing from
 *  both the center and the rest of the workbook — needs a placeholder row. */
export type ReferencePlaceholder = { sheet: BackupSheetName; id: string };

export type ReferenceRowOutcome = {
  /** The row with any droppable dangling `link` references nulled out — the
   *  same object as the input when nothing changed. */
  row: BackupRow;
  /** Non-blocking notes to merge into the row's report reason, one per
   *  dropped nullable link (`dropped-missing-link:groupId`). */
  droppedLinkReasons: readonly string[];
  /** Set when a required `link` reference has no resolvable target — forces
   *  the row `invalid` regardless of its original classification. `;`-joined
   *  when more than one required link is missing, matching the existing
   *  multi-failure reason convention. */
  brokenLinkReason: string | null;
};

export type ReferenceResolution = {
  /** Deduplicated — one entry per (sheet, id), however many rows reference it. */
  placeholders: readonly ReferencePlaceholder[];
  /** Index-aligned with the `processedBySheet` list passed in for that sheet. */
  outcomesBySheet: ReadonlyMap<BackupSheetName, readonly ReferenceRowOutcome[]>;
};

const EMPTY_KNOWN: ReadonlySet<string> = new Set();

function idMatchesSheetShape(id: string, spec: BackupSheetSpec): boolean {
  return spec.idIsDeterministic === true ? hasDeterministicIdPrefix(id, spec.idPrefix) : hasIdPrefix(id, spec.idPrefix);
}

function referencedIds(value: unknown, multiplicity: 'single' | 'list'): readonly string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return multiplicity === 'list' ? value.split(',').filter((id) => id.length > 0) : [value];
}

/**
 * Plan how to repair every dangling reference in a workbook that has already
 * been classified row-by-row (SOU-317): which missing catalog ids need a
 * placeholder row, and which rows need a dangling `link` reference dropped or
 * turned invalid. Pure — takes the classification {@link classifyImportRow}
 * already computed plus the final known-id set per sheet (existing DB rows
 * union the ids of every row this workbook classifies `created`/`updated`),
 * and returns a plan; it writes nothing. Both `PreviewImportBackup` (to
 * report the repair) and `ApplyImportBackup` (to actually perform it) call
 * this the same way, so they can never disagree about what happens.
 *
 * Only rows already classified `created` or `updated` are considered — a row
 * that's `duplicate` or already `invalid` for a structural reason is skipped
 * either way, so its references are irrelevant.
 */
export function resolveWorkbookReferences(
  processedBySheet: ReadonlyMap<BackupSheetName, readonly ClassifiedRow[]>,
  knownIdsBySheet: ReadonlyMap<BackupSheetName, ReadonlySet<string>>,
): ReferenceResolution {
  const willExist = new Map<BackupSheetName, Set<string>>();
  for (const [sheet, ids] of knownIdsBySheet) willExist.set(sheet, new Set(ids));

  const placeholders: ReferencePlaceholder[] = [];
  const placeholderKeys = new Set<string>();

  for (const [sheetName, rows] of processedBySheet) {
    const spec = findBackupSheet(sheetName);
    if (spec === null) continue;
    for (const { row, status } of rows) {
      if (status !== 'created' && status !== 'updated') continue;
      for (const column of spec.columns) {
        const reference = column.reference;
        if (reference === undefined || reference.kind !== 'catalog') continue;
        const targetSpec = findBackupSheet(reference.sheet);
        if (targetSpec === null) continue;
        const targetKnown = willExist.get(reference.sheet) ?? new Set<string>();
        willExist.set(reference.sheet, targetKnown);
        for (const id of referencedIds(row[column.name], reference.multiplicity)) {
          if (targetKnown.has(id) || !idMatchesSheetShape(id, targetSpec)) continue;
          const key = `${reference.sheet}::${id}`;
          if (placeholderKeys.has(key)) continue;
          placeholderKeys.add(key);
          placeholders.push({ sheet: reference.sheet, id });
          targetKnown.add(id);
        }
      }
    }
  }

  const outcomesBySheet = new Map<BackupSheetName, ReferenceRowOutcome[]>();
  for (const [sheetName, rows] of processedBySheet) {
    const spec = findBackupSheet(sheetName);
    const outcomes: ReferenceRowOutcome[] = [];
    for (const { row, status } of rows) {
      if (spec === null || (status !== 'created' && status !== 'updated')) {
        outcomes.push({ row, droppedLinkReasons: [], brokenLinkReason: null });
        continue;
      }
      let adjustedRow = row;
      const dropped: string[] = [];
      const broken: string[] = [];
      for (const column of spec.columns) {
        const reference = column.reference;
        if (reference === undefined || reference.kind !== 'link' || reference.multiplicity !== 'single') continue;
        const value = row[column.name];
        if (typeof value !== 'string' || value.length === 0) continue;
        const targetSpec = findBackupSheet(reference.sheet);
        if (targetSpec === null || !idMatchesSheetShape(value, targetSpec)) continue;
        const targetKnown = willExist.get(reference.sheet) ?? EMPTY_KNOWN;
        if (targetKnown.has(value)) continue;
        if (column.type === 'string-or-null') {
          adjustedRow = adjustedRow === row ? { ...row } : adjustedRow;
          adjustedRow[column.name] = null;
          dropped.push(`dropped-missing-link:${column.name}`);
        } else {
          broken.push(`missing-link:${column.name}`);
        }
      }
      outcomes.push({
        row: adjustedRow,
        droppedLinkReasons: dropped,
        brokenLinkReason: broken.length > 0 ? broken.join(';') : null,
      });
    }
    outcomesBySheet.set(sheetName, outcomes);
  }

  return { placeholders, outcomesBySheet };
}
