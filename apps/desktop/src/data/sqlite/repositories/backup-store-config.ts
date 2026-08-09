import type { BackupCellValue } from '@centresoutien/domain';

/** Domain column name → table column name, plus per-sheet write behavior. */
export type SheetSqlConfig = {
  table: string;
  columns: readonly (readonly [domainColumn: string, sqlColumn: string])[];
  /**
   * `upsert` rewrites the non-identity columns on an existing id; `skip` leaves
   * an existing id untouched (INSERT … ON CONFLICT DO NOTHING). `skip` is
   * reserved for tables whose rows must never be rewritten in place: `payments`
   * (append-only UPDATE trigger) and `formulas` (immutable-once-billed UPDATE
   * guard).
   */
  conflict: 'upsert' | 'skip';
  /**
   * Domain columns that are read/exported but never written by the backup
   * import — the DB (or its triggers) owns them. `formulas.isImmutable` is the
   * only one today: immutability is granted solely by the invoice-lines
   * triggers, so a hand-edited workbook can never fabricate a frozen formula.
   */
  readOnlyColumns?: readonly string[];
};

/** Domain columns whose value is a 0/1 SQLite integer. */
export const BOOLEAN_COLUMNS = new Set([
  'whatsappOptIn',
  'active',
  'isImmutable',
  'conflictAccepted',
]);

/** Domain columns stored as a JSON array string in SQLite, comma-joined in the
 *  workbook (ULIDs contain no commas, so the join is unambiguous). */
export const JSON_ID_COLUMNS = new Set(['guardianIds', 'subjectIds']);

/** Columns never rewritten on an upsert conflict — identity, not state.
 *  `version` is the hub-assigned optimistic-concurrency counter: a restore
 *  updates the fields + stamps updatedAt but must never fabricate a fresh
 *  version, or it could clobber a newer local revision on the next sync. */
export const IDENTITY_COLUMNS = new Set(['id', 'center_code', 'device_origin', 'created_at', 'version']);

export function toSqlValue(domainColumn: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (BOOLEAN_COLUMNS.has(domainColumn)) return value === true || value === 1 ? 1 : 0;
  if (JSON_ID_COLUMNS.has(domainColumn)) {
    if (typeof value !== 'string' || value.length === 0) return '[]';
    return JSON.stringify(value.split(','));
  }
  return value;
}

export function fromSqlValue(domainColumn: string, value: unknown): BackupCellValue {
  if (value === null || value === undefined) return null;
  if (BOOLEAN_COLUMNS.has(domainColumn)) return value !== 0 && value !== '0' && value !== false;
  if (JSON_ID_COLUMNS.has(domainColumn)) {
    if (typeof value !== 'string' || value.length === 0) return '';
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.join(',') : '';
    } catch {
      return '';
    }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}
