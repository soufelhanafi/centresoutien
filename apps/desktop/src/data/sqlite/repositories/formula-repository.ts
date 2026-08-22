import type { Database as DB } from 'better-sqlite3';
import { z } from 'zod';
import { subjectPrice } from '@centresoutien/domain';
import type {
  Formula,
  FormulaId,
  FormulaRepository,
  FormulaSubjectPrice,
  GroupKind,
  SubjectId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** Validate persisted `subject_prices` JSON before trusting it — the repo parses to
 *  `unknown` then narrows via the domain schema (mirrors `student-repository`), never
 *  a blind `as` cast on `JSON.parse`. */
const subjectPricesSchema = z.array(subjectPrice);

function parseSubjectPrices(json: string): FormulaSubjectPrice[] {
  const parsed: unknown = JSON.parse(json);
  return subjectPricesSchema
    .parse(parsed)
    .map((entry) => ({ subjectId: entry.subjectId as SubjectId, priceMad: entry.priceMad }));
}

/** The `formulas` table row shape as SQLite returns it. */
type FormulaRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  name_fr: string;
  name_ar: string;
  subject_ids: string;
  price_mad: number;
  subject_prices: string | null;
  kind: string;
  is_immutable: number;
  active: number;
};

function fromRow(row: FormulaRow): Formula {
  return {
    id: row.id as FormulaId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    name: { fr: row.name_fr, ar: row.name_ar },
    subjectIds: JSON.parse(row.subject_ids) as SubjectId[],
    priceMad: row.price_mad,
    // NULL (legacy/un-priced) reads as an absent map — the domain falls back to the
    // equal split. Present JSON is the per-subject price map (SOU-298).
    ...(row.subject_prices !== null && {
      subjectPrices: parseSubjectPrices(row.subject_prices),
    }),
    kind: row.kind as GroupKind,
    isImmutable: row.is_immutable === 1,
    active: row.active === 1,
  };
}

// `is_immutable` is deliberately absent from both the column list and the SET
// clause: the AFTER INSERT trigger on invoice_lines (0023) is the sole writer of
// that column. A caller that reaches this adapter with a content patch on an
// already-immutable formula has already been rejected by `updateFormula`
// (FormulaImmutableError) before getting here; the BEFORE UPDATE guard trigger
// aborts the statement as the DB-level safety net either way.
const SAVE_SQL = `
  INSERT INTO formulas
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name_fr, name_ar, subject_ids, price_mad, subject_prices, kind, active)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name_fr, @name_ar, @subject_ids, @price_mad, @subject_prices, @kind, @active)
  ON CONFLICT(id) DO UPDATE SET
    updated_at     = excluded.updated_at,
    updated_by     = excluded.updated_by,
    deleted_at     = excluded.deleted_at,
    version        = excluded.version,
    name_fr        = excluded.name_fr,
    name_ar        = excluded.name_ar,
    subject_ids    = excluded.subject_ids,
    price_mad      = excluded.price_mad,
    subject_prices = excluded.subject_prices,
    kind           = excluded.kind,
    active         = excluded.active
`;

/**
 * SQLite adapter for {@link FormulaRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the
 * sync feed) includes them. `is_immutable` is read but never written here — see
 * {@link SAVE_SQL}.
 */
export class SqliteFormulaRepository implements FormulaRepository {
  constructor(private readonly db: DB) {}

  async save(formula: Formula): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: formula.id,
      center_code: formula.centerCode,
      device_origin: formula.deviceOrigin,
      created_at: formula.createdAt.toISOString(),
      updated_at: formula.updatedAt.toISOString(),
      updated_by: formula.updatedBy,
      deleted_at: formula.deletedAt ? formula.deletedAt.toISOString() : null,
      version: formula.version,
      name_fr: formula.name.fr,
      name_ar: formula.name.ar,
      subject_ids: JSON.stringify(formula.subjectIds),
      price_mad: formula.priceMad,
      subject_prices:
        formula.subjectPrices && formula.subjectPrices.length > 0
          ? JSON.stringify(formula.subjectPrices)
          : null,
      kind: formula.kind,
      active: formula.active ? 1 : 0,
    });
  }

  async findById(id: FormulaId): Promise<Formula | null> {
    const row = this.db
      .prepare('SELECT * FROM formulas WHERE id = ? AND deleted_at IS NULL')
      .get(id) as FormulaRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: FormulaId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE formulas SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Formula[]> {
    const rows = this.db
      .prepare('SELECT * FROM formulas WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as FormulaRow[];
    return rows.map(fromRow);
  }

  async listActive(centerCode: CenterCode): Promise<readonly Formula[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM formulas
          WHERE center_code = ? AND deleted_at IS NULL AND active = 1
          ORDER BY name_fr COLLATE NOCASE, id`,
      )
      .all(centerCode) as FormulaRow[];
    return rows.map(fromRow);
  }

  async listAll(centerCode: CenterCode): Promise<readonly Formula[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM formulas
          WHERE center_code = ? AND deleted_at IS NULL
          ORDER BY name_fr COLLATE NOCASE, id`,
      )
      .all(centerCode) as FormulaRow[];
    return rows.map(fromRow);
  }
}
