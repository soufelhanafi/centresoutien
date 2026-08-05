import {
  findBackupSheet,
  type BackupRow,
  type BackupSheetName,
} from '../../../src/backup/backup-workbook';

export const CENTER = 'CS-CASA-001';

/** A valid ULID matching the sheet's id prefix (e.g. `stu_01HWA…`). */
export function validId(prefix: string, seed = '01HWAAAAAAAAAAAAAAAAAAAAAA'): string {
  return `${prefix}_${seed}`;
}

const FILLERS: Record<string, unknown> = {
  'string-or-null': null,
  number: 1,
  boolean: false,
};

/**
 * Build a fully-populated, structurally valid workbook row for a sheet. `overrides`
 * win; pass `{ id: undefined }` to build an id-less people-like row (fresh-ULID
 * creation), and `omit: [...]` to drop optional envelope fields.
 */
export function validBackupRow(
  sheetName: BackupSheetName,
  overrides: Record<string, unknown> = {},
  omit: readonly string[] = [],
): BackupRow {
  const spec = findBackupSheet(sheetName);
  if (spec === null) throw new Error(`unknown sheet: ${sheetName}`);

  const row: Record<string, unknown> = {
    id: validId(spec.idPrefix),
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    updatedBy: 'usr_00000000000000000000000001',
    deletedAt: null,
    version: 0,
  };
  if (spec.naturalKeyColumn !== null) {
    row[spec.naturalKeyColumn] = `${CENTER}::default::${validId(spec.idPrefix)}`;
  }
  for (const column of spec.columns) {
    if (row[column.name] !== undefined) continue;
    row[column.name] = FILLERS[column.type] ?? 'x';
  }

  const merged = { ...row, ...overrides };
  for (const key of omit) delete merged[key];
  return merged as BackupRow;
}
