import type { BackupRow, BackupSheetSpec } from './backup-workbook';
import { hasIdPrefix } from '../value-objects/ids';
import type { CenterCode } from '../value-objects/ids';

/**
 * Row-level validation and import classification for the backup engine (SOU-44).
 * Pure domain logic shared by `PreviewImportBackup` and `ApplyImportBackup` so
 * the preview and the apply can never disagree on what a row means.
 *
 * Validation is structural (columns present + cell types) — the values already
 * came from this app's own export, so the goal is to catch a hand-edited or
 * partial workbook, not to re-run every entity's business schema. Extra columns
 * are ignored (forward-compatible), missing optional columns are tolerated, and
 * every other required column must be present with the right type.
 */

export type ImportRowStatus = 'created' | 'updated' | 'duplicate' | 'invalid';

export type RowClassification = {
  status: ImportRowStatus;
  /** Human-readable reason (stable token, i18n key suffix), null when clean. */
  reason: string | null;
};

/** Validate a single row against its sheet spec. Returns failure reasons. */
export function validateBackupRow(
  spec: BackupSheetSpec,
  row: unknown,
): readonly string[] {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    return ['not-a-row'];
  }
  const record = row as Record<string, unknown>;

  const reasons: string[] = [];
  for (const column of spec.columns) {
    const present = Object.prototype.hasOwnProperty.call(record, column.name);
    const value = record[column.name];

    if (!present) {
      if (column.optional) continue;
      reasons.push(`missing-field:${column.name}`);
      continue;
    }
    if (value === null || value === undefined) {
      if (column.type === 'string-or-null' || column.optional) continue;
      reasons.push(`bad-type:${column.name}`);
      continue;
    }
    if (column.type === 'string-or-null' && typeof value !== 'string') {
      // A hand-edited nullable cell holding a number would be written into a
      // TEXT column and re-export as a number where the schema expects a string.
      reasons.push(`bad-type:${column.name}`);
      continue;
    }
    if (column.type === 'number' && typeof value !== 'number') {
      reasons.push(`bad-type:${column.name}`);
      continue;
    }
    if (column.type === 'boolean' && typeof value !== 'boolean') {
      reasons.push(`bad-type:${column.name}`);
      continue;
    }
    if (column.type === 'string' && typeof value !== 'string') {
      reasons.push(`bad-type:${column.name}`);
      continue;
    }
  }
  return reasons;
}

/**
 * Classify a workbook row as created / updated / duplicate / invalid against the
 * center's existing rows (the in-memory index the caller builds from
 * `BackupStore.readAllRows`).
 *
 * Rules (KICKOFF SOU-44):
 * - row `id` present and matching the sheet's prefix → `updated` if the id
 *   already exists, else `created`.
 * - row `id` absent: only people-like sheets may create — `created` (fresh ULID +
 *   envelope at apply) unless a live row already carries the same `naturalKey`,
 *   which is `duplicate` (merged by the sync engine, never by backup restore).
 * - any structural failure → `invalid`.
 * - a `centerCode` that differs from the active center is `invalid` — importing
 *   into another center is a later ticket.
 */
export function classifyImportRow(input: {
  spec: BackupSheetSpec;
  row: BackupRow;
  existingIds: ReadonlySet<string>;
  existingNaturalKeys: ReadonlySet<string>;
  centerCode: CenterCode;
}): RowClassification {
  const { spec, row, existingIds, existingNaturalKeys, centerCode } = input;

  const failures = validateBackupRow(spec, row);
  if (failures.length > 0) {
    return { status: 'invalid', reason: failures.join(';') };
  }

  if (row['centerCode'] !== centerCode) {
    return { status: 'invalid', reason: 'wrong-center' };
  }

  const id = row['id'];
  if (id !== null && id !== undefined) {
    if (typeof id !== 'string' || !hasIdPrefix(id, spec.idPrefix)) {
      return { status: 'invalid', reason: 'invalid-id' };
    }
    // An id-carrying row restores an existing entity, so its envelope must be
    // complete — id-less rows get a fresh envelope minted at apply instead.
    if (!hasCompleteEnvelope(row)) {
      return { status: 'invalid', reason: 'incomplete-envelope' };
    }
    return existingIds.has(id)
      ? { status: 'updated', reason: null }
      : { status: 'created', reason: null };
  }

  if (!spec.peopleLike) {
    return { status: 'invalid', reason: 'id-required' };
  }

  const naturalKey = row[spec.naturalKeyColumn ?? 'naturalKey'];
  if (typeof naturalKey !== 'string' || naturalKey.length === 0) {
    return { status: 'invalid', reason: 'natural-key-required' };
  }
  return existingNaturalKeys.has(naturalKey)
    ? { status: 'duplicate', reason: 'natural-key-exists' }
    : { status: 'created', reason: null };
}

/** The envelope fields an id-carrying row must bring back with it. */
const REQUIRED_ENVELOPE_FIELDS = ['deviceOrigin', 'createdAt', 'updatedAt', 'updatedBy', 'version'] as const;

function hasCompleteEnvelope(row: BackupRow): boolean {
  return REQUIRED_ENVELOPE_FIELDS.every((field) => {
    const value = row[field];
    return typeof value === 'string' || typeof value === 'number';
  });
}
