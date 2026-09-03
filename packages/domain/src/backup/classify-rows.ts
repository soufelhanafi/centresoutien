import type { BackupRow, BackupSheetSpec } from './backup-workbook';
import { hasIdPrefix, hasDeterministicIdPrefix } from '../value-objects/ids';
import type { CenterCode } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import { areOrderedNonOverlappingWindows, type TimeWindow } from '../value-objects/time-window';
import { hoursByWeekdaySchema } from '../schemas/center-hours-override';

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
    // SOU-197 stores a weekday's windows as one opaque JSON string on the
    // center-hours sheet. A hand-edited workbook can carry valid JSON that
    // violates the ordered/non-overlapping window invariants — or no JSON at
    // all — so parse and shape-check here rather than trusting the cell.
    if (column.name === 'windows') {
      const windows = parseWindowsJson(value as string);
      if (windows === null || !areOrderedNonOverlappingWindows(windows)) {
        reasons.push('invalid-windows');
      }
    }
    // SOU-264: the synced-settings sheets carry the weekly-window record as one
    // opaque JSON string (`hoursByWeekday`, `weeklyWindows`). Validate the
    // complete `0..6` weekday record with the same domain schema the form and
    // use case use, so a hand-edited or partial cell is rejected here (stable
    // row-level reason) instead of being JSON.parsed into a broken domain
    // entity — or worse, aborting the atomic restore after the preview accepted
    // it.
    if (column.name === 'hoursByWeekday' || column.name === 'weeklyWindows') {
      if (parseWeeklyWindowsJson(value as string) === null) {
        reasons.push('invalid-weekly-windows');
      }
    }
  }
  return reasons;
}

/**
 * Parse a center-hours `windows` cell (a JSON array of `{ open, close }` objects)
 * into typed windows, or `null` when the text is not such an array. Structural
 * validity (each window well-formed, ordered, non-overlapping) is checked by the
 * caller via {@link areOrderedNonOverlappingWindows}; this only handles the
 * JSON decoding and array-of-records shape.
 */
function parseWindowsJson(value: string): readonly TimeWindow[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const windows: TimeWindow[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) return null;
      const record = entry as { open?: unknown; close?: unknown };
      if (typeof record.open !== 'string' || typeof record.close !== 'string') return null;
      windows.push({ open: record.open as TimeOfDay, close: record.close as TimeOfDay });
    }
    return windows;
  } catch {
    return null;
  }
}

// Parse a `hoursByWeekday` / `weeklyWindows` cell — a JSON object keyed
// `"0".."6"` whose values are arrays of `{ open, close }` windows — or `null`
// when the text is not a well-formed weekly-window record. Shape and ordering
// are validated by the shared `hoursByWeekdaySchema` (the same one the
// SOU-165/259 forms and use cases use), so the workbook cell is held to the
// exact domain contract: all seven weekdays present, each an ordered,
// non-overlapping window list. Decoding an object of arrays by hand mirrors
// `parseWindowsJson`; the schema does the narrowing.
function parseWeeklyWindowsJson(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const result = hoursByWeekdaySchema.safeParse(parsed);
    return result.success ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The bilingual AR name/label columns (SOU-271). AR is optional data entry now:
 * an unused AR value is stored as `''` (never null) in its `TEXT NOT NULL` column.
 * exceljs reads an empty cell back as `null`, so a FR-only workbook arrives with
 * `name_ar`/`label_ar` = null — see {@link coerceEmptyArColumns}.
 */
const EMPTY_ALLOWED_AR_COLUMNS: ReadonlySet<string> = new Set(['name_ar', 'label_ar']);

/**
 * Coerce a null/absent AR name-or-label cell back to `''` before classification
 * and apply (SOU-271). Without this a FR-only workbook — whose empty AR cell
 * round-trips through exceljs as `null` — would fail the `string` type check
 * (`bad-type`) and, even if it passed, bind `null` into the `NOT NULL` column on
 * restore. Only the AR columns a sheet actually declares are touched, so no other
 * required-string column loosens.
 */
function coerceEmptyArColumns(spec: BackupSheetSpec, row: BackupRow): BackupRow {
  let coerced: BackupRow | null = null;
  for (const column of spec.columns) {
    if (!EMPTY_ALLOWED_AR_COLUMNS.has(column.name)) continue;
    const value = row[column.name];
    if (value === null || value === undefined) {
      coerced ??= { ...row };
      coerced[column.name] = '';
    }
  }
  return coerced ?? row;
}

/**
 * A legacy center-hours backup (pre-SOU-197) exported one `open`/`close` pair per
 * weekday instead of the current `windows` list. On import, such rows carry no
 * `windows` column and would be classified invalid and silently dropped — losing
 * the center's hours. Upcast them the same way the 0041 migration backfills:
 * an open day becomes a single window, a closed (`null`/`null`) day becomes `[]`.
 * Rows that already carry `windows` pass through unchanged. Empty AR name/label
 * cells are coerced to `''` here too (SOU-271) so preview and apply agree.
 */
export function normalizeBackupRow(spec: BackupSheetSpec, row: BackupRow): BackupRow {
  const withArDefaults = coerceEmptyArColumns(spec, row);
  if (spec.name !== 'center-hours') return withArDefaults;
  if ('windows' in withArDefaults) return withArDefaults;
  const open = withArDefaults['open'];
  const close = withArDefaults['close'];
  const windows =
    typeof open === 'string' && typeof close === 'string'
      ? JSON.stringify([{ open, close }])
      : '[]';
  return { ...withArDefaults, windows };
}

/**
 * Classify a workbook row as created / updated / duplicate / invalid against the
 * center's existing rows (the in-memory index the caller builds from
 * `BackupStore.readAllRows`).
 *
 * Rules (KICKOFF SOU-44):
 * - row `id` present and matching the sheet's prefix → `updated` if the id
 *   already exists, else `created`.
 * - an existing id on a `restoreConflict: 'skip'` sheet (append-only `payments`,
 *   immutable `formulas`) is `duplicate` — the apply leaves it untouched, so the
 *   preview must never report it as `updated` (preview and apply in lockstep).
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
    const idIsValid =
      typeof id === 'string' &&
      (spec.idIsDeterministic === true
        ? hasDeterministicIdPrefix(id, spec.idPrefix)
        : hasIdPrefix(id, spec.idPrefix));
    if (!idIsValid) {
      return { status: 'invalid', reason: 'invalid-id' };
    }
    // An id-carrying row restores an existing entity, so its envelope must be
    // complete — id-less rows get a fresh envelope minted at apply instead.
    if (!hasCompleteEnvelope(row)) {
      return { status: 'invalid', reason: 'incomplete-envelope' };
    }
    return existingIds.has(id)
      ? classifyExistingIdRow(spec)
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

/**
 * An id that already exists: on a `restoreConflict: 'skip'` sheet the apply is a
 * no-op (append-only / immutable), so the row is a replay — a `duplicate`, never
 * an `updated`. On an `upsert` sheet the row is a genuine restore edit.
 */
function classifyExistingIdRow(spec: BackupSheetSpec): RowClassification {
  return spec.restoreConflict === 'skip'
    ? { status: 'duplicate', reason: 'already-exists' }
    : { status: 'updated', reason: null };
}

/**
 * The envelope fields an id-carrying row must bring back with it. `deletedAt` is
 * required too (a tombstone must round-trip), but it is the one nullable member —
 * a live row legitimately carries `deletedAt: null`.
 */
const REQUIRED_ENVELOPE_FIELDS: readonly { name: string; nullable: boolean }[] = [
  { name: 'deviceOrigin', nullable: false },
  { name: 'createdAt', nullable: false },
  { name: 'updatedAt', nullable: false },
  { name: 'updatedBy', nullable: false },
  { name: 'deletedAt', nullable: true },
  { name: 'version', nullable: false },
];

function hasCompleteEnvelope(row: BackupRow): boolean {
  for (const { name, nullable } of REQUIRED_ENVELOPE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, name)) return false;
    const value = row[name];
    if (value === null || value === undefined) {
      if (!nullable) return false;
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') return false;
  }
  return true;
}
