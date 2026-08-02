import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Formula,
  FormulaId,
  SubjectId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import {
  loadMigrations,
  applyMigrations,
  runMigrations,
} from '../../src/data/sqlite/migration-runner';
import { SqliteFormulaRepository } from '../../src/data/sqlite/repositories/formula-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const MATH = 'sub_00000000000000000000000003' as SubjectId;
const PHYS = 'sub_00000000000000000000000004' as SubjectId;

let dir: string;
let db: DB;
let repo: SqliteFormulaRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-fml-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteFormulaRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-08-01T10:00:00Z');

function makeFormula(over: Partial<Formula> = {}): Formula {
  return {
    id: 'fml_00000000000000000000000001' as FormulaId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    subjectIds: [MATH, PHYS],
    priceMad: 35000,
    kind: 'regular',
    isImmutable: false,
    active: true,
    ...over,
  };
}

/** Inserts a bare invoice_lines row referencing `formulaId` — no invoices header
 *  needed (invoice_lines carries no FK, sync-order safe per 0018) — purely to
 *  exercise the trg_formulas_flip_immutable trigger under test. */
function insertInvoiceLine(database: DB, id: string, formulaId: string): void {
  database
    .prepare(
      `INSERT INTO invoice_lines
        (id, center_code, device_origin, created_at, updated_at, updated_by,
         deleted_at, version, invoice_id, formula_id, label_fr, label_ar, kind, amount_mad)
       VALUES
        (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      CENTER,
      'dev_00000000000000000000000001',
      AT.toISOString(),
      AT.toISOString(),
      'usr_00000000000000000000000001',
      'inv_00000000000000000000000001',
      formulaId,
      'Math + Physique',
      'رياضيات وفيزياء',
      'regular',
      35000,
    );
}

describe('SqliteFormulaRepository', () => {
  it('round-trips a formula through save + findById with all fields intact', async () => {
    const formula = makeFormula();
    await repo.save(formula);
    expect(await repo.findById(formula.id)).toEqual(formula);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('fml_00000000000000000000000099' as FormulaId)).toBeNull();
  });

  it('upsert updates mutable fields on a second save of the same id', async () => {
    await repo.save(makeFormula());
    await repo.save(
      makeFormula({
        name: { fr: 'Math seul', ar: 'رياضيات فقط' },
        subjectIds: [MATH],
        priceMad: 20000,
        active: false,
        version: 3,
        updatedAt: new Date('2026-08-02T09:00:00Z'),
      }),
    );
    const found = await repo.findById('fml_00000000000000000000000001' as FormulaId);
    expect(found?.name).toEqual({ fr: 'Math seul', ar: 'رياضيات فقط' });
    expect(found?.subjectIds).toEqual([MATH]);
    expect(found?.priceMad).toBe(20000);
    expect(found?.active).toBe(false);
    expect(found?.version).toBe(3);
  });

  it('save() never writes is_immutable — it stays 0 across upserts even if a caller tries to set it true', async () => {
    await repo.save(makeFormula({ isImmutable: false }));
    // A stray domain caller passing isImmutable: true must not smuggle it in —
    // the adapter's SAVE_SQL has no is_immutable column at all.
    await repo.save(makeFormula({ isImmutable: true, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') }));
    const found = await repo.findById('fml_00000000000000000000000001' as FormulaId);
    expect(found?.isImmutable).toBe(false);
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const formula = makeFormula();
    await repo.save(formula);
    await repo.softDelete(formula.id, new Date('2026-08-03T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);

    expect(await repo.findById(formula.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-03T00:00:00Z'));
  });

  describe('listActive', () => {
    const RABAT = 'CS-RABAT-002' as CenterCode;

    beforeEach(async () => {
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000001' as FormulaId, name: { fr: 'Physique', ar: 'فيزياء' }, active: true }));
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000002' as FormulaId, name: { fr: 'Arabe', ar: 'العربية' }, active: true }));
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000003' as FormulaId, name: { fr: 'Chimie', ar: 'كيمياء' }, active: false }));
      const gone = makeFormula({ id: 'fml_00000000000000000000000004' as FormulaId, name: { fr: 'Anglais', ar: 'إنجليزية' } });
      await repo.save(gone);
      await repo.softDelete(gone.id, new Date('2026-08-03T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000005' as FormulaId, centerCode: RABAT, name: { fr: 'Géographie', ar: 'جغرافيا' } }));
    });

    it('returns only live, active formulas of the center, name-ordered', async () => {
      const rows = await repo.listActive(CENTER);
      expect(rows.map((f) => f.name.fr)).toEqual(['Arabe', 'Physique']);
    });

    it('is center-scoped', async () => {
      const rows = await repo.listActive(RABAT);
      expect(rows.map((f) => f.name.fr)).toEqual(['Géographie']);
    });

    it('listAll returns every live formula (active + inactive), excluding tombstones and other centers', async () => {
      const rows = await repo.listAll(CENTER);
      expect(rows.map((f) => f.name.fr)).toEqual(['Arabe', 'Chimie', 'Physique']);
    });
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000001' as FormulaId, updatedAt: new Date('2026-07-01T00:00:00Z') }));
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000002' as FormulaId, updatedAt: new Date('2026-07-20T00:00:00Z') }));

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((f) => f.id)).toEqual(['fml_00000000000000000000000002']);
    });
  });

  describe('immutability trigger', () => {
    it('trg_formulas_flip_immutable flips is_immutable to 1 atomically on the first invoice-line insert', async () => {
      await repo.save(makeFormula());
      expect((await repo.findById('fml_00000000000000000000000001' as FormulaId))?.isImmutable).toBe(false);

      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      const row = db
        .prepare('SELECT is_immutable FROM formulas WHERE id = ?')
        .get('fml_00000000000000000000000001') as { is_immutable: number };
      expect(row.is_immutable).toBe(1);
    });

    it('a second invoice-line insert against an already-immutable formula does not raise (no-op flip)', async () => {
      await repo.save(makeFormula());
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');
      expect(() =>
        insertInvoiceLine(db, 'invl_00000000000000000000000002', 'fml_00000000000000000000000001'),
      ).not.toThrow();

      const row = db
        .prepare('SELECT is_immutable FROM formulas WHERE id = ?')
        .get('fml_00000000000000000000000001') as { is_immutable: number };
      expect(row.is_immutable).toBe(1);
    });

    it('trg_formulas_immutable_guard rejects a direct UPDATE once immutable', async () => {
      await repo.save(makeFormula());
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      expect(() =>
        db.prepare('UPDATE formulas SET price_mad = 99999 WHERE id = ?').run('fml_00000000000000000000000001'),
      ).toThrow();
    });

    it('rejects the repository save() (content patch) once immutable', async () => {
      await repo.save(makeFormula());
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      await expect(
        repo.save(makeFormula({ priceMad: 99999, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') })),
      ).rejects.toThrow();
    });

    it('rejects even a soft-delete UPDATE once immutable — a billed formula stays resolvable forever', async () => {
      await repo.save(makeFormula());
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      await expect(
        repo.softDelete('fml_00000000000000000000000001' as FormulaId, new Date('2026-08-03T00:00:00Z'), 'usr_00000000000000000000000001' as UserId),
      ).rejects.toThrow();
    });

    it('(0024) allows repository save() to flip active 1 -> 0 on an immutable formula and nothing else', async () => {
      await repo.save(makeFormula({ active: true }));
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      await expect(
        repo.save(makeFormula({ active: false, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') })),
      ).resolves.toBeUndefined();

      const found = await repo.findById('fml_00000000000000000000000001' as FormulaId);
      expect(found?.active).toBe(false);
      expect(found?.isImmutable).toBe(true);
      expect(found?.priceMad).toBe(35000); // untouched
      expect(found?.version).toBe(1);
    });

    it('(0024) still rejects a save() that bundles a content change with the active flip', async () => {
      await repo.save(makeFormula({ active: true }));
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      await expect(
        repo.save(makeFormula({ active: false, priceMad: 99999, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') })),
      ).rejects.toThrow();
    });

    it('(0024) still rejects reactivating an immutable formula (0 -> 1)', async () => {
      await repo.save(makeFormula({ active: false }));
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      await expect(
        repo.save(makeFormula({ active: true, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') })),
      ).rejects.toThrow();
    });

    it('(0024) still rejects a save() that is a no-op replay of an already-active immutable row', async () => {
      await repo.save(makeFormula({ active: true }));
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      await expect(
        repo.save(makeFormula({ active: true, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') })),
      ).rejects.toThrow();
    });

    it('does not fire for an unrelated formula id', async () => {
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000001' as FormulaId }));
      await repo.save(makeFormula({ id: 'fml_00000000000000000000000002' as FormulaId }));
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      const other = db
        .prepare('SELECT is_immutable FROM formulas WHERE id = ?')
        .get('fml_00000000000000000000000002') as { is_immutable: number };
      expect(other.is_immutable).toBe(0);
      // Still freely editable.
      await expect(repo.save(makeFormula({ id: 'fml_00000000000000000000000002' as FormulaId, priceMad: 1000, version: 1 }))).resolves.toBeUndefined();
    });

    it('trg_formulas_backfill_immutable flips is_immutable on insert when an invoice line already references it (out-of-order sync)', async () => {
      // The invoice line arrives (e.g. via a sync pull) before this device has
      // ever seen the formula's own row — trg_formulas_flip_immutable's UPDATE
      // matched zero rows when this ran.
      insertInvoiceLine(db, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

      // The formula's own row lands for the first time, still with the fresh
      // default is_immutable = 0 baked into a plain INSERT.
      await repo.save(makeFormula());

      const found = await repo.findById('fml_00000000000000000000000001' as FormulaId);
      expect(found?.isImmutable).toBe(true);
    });

    it('does not flip is_immutable on insert when no invoice line references the new formula', async () => {
      await repo.save(makeFormula());
      const found = await repo.findById('fml_00000000000000000000000001' as FormulaId);
      expect(found?.isImmutable).toBe(false);
    });

    it('trg_formulas_backfill_immutable does not fire for a re-save via ON CONFLICT DO UPDATE (only a true INSERT)', async () => {
      // No invoice line at all — the row starts and stays mutable. This just
      // proves an ordinary upsert (already covered above) never accidentally
      // routes through the AFTER INSERT path.
      await repo.save(makeFormula());
      await repo.save(makeFormula({ priceMad: 12345, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') }));
      const found = await repo.findById('fml_00000000000000000000000001' as FormulaId);
      expect(found?.isImmutable).toBe(false);
      expect(found?.priceMad).toBe(12345);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the fml_ prefix (CHECK)', async () => {
      await expect(repo.save(makeFormula({ id: 'bad_00000000000000000000000001' as FormulaId }))).rejects.toThrow();
    });

    it('rejects an unknown kind (CHECK)', async () => {
      await expect(repo.save(makeFormula({ kind: 'invalid' as Formula['kind'] }))).rejects.toThrow();
    });

    it('rejects a non-positive price (CHECK)', async () => {
      await expect(repo.save(makeFormula({ priceMad: 0 }))).rejects.toThrow();
    });

    it('rejects an out-of-range active value (CHECK active IN (0,1))', () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO formulas
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
                name_fr, name_ar, subject_ids, price_mad, kind, active)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,?,2)`,
          )
          .run(
            'fml_00000000000000000000000009',
            CENTER,
            'dev_1',
            AT.toISOString(),
            AT.toISOString(),
            'usr_1',
            'M',
            'م',
            JSON.stringify([MATH]),
            10000,
            'regular',
          ),
      ).toThrow();
    });
  });

  describe('migration replay', () => {
    it('applies 0023 cleanly on a DB already migrated to 0022', () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-fml-replay-'));
      const stale = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo22 = all.filter((m) => m.version <= 22);
        applyMigrations(stale, upTo22);
        expect(() => stale.prepare('SELECT 1 FROM formulas LIMIT 1').get()).toThrow();

        const applied = applyMigrations(stale, all);
        expect(applied).toContain(23);
        expect(stale.prepare('SELECT COUNT(*) AS n FROM formulas').get()).toEqual({ n: 0 });
      } finally {
        stale.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });

    it('applies 0024 cleanly on a DB already migrated to 0023, and the redefined guard still allows only the deactivate write', async () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-fml-replay24-'));
      const stale = openDatabase({ centreId: 'C3', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo23 = all.filter((m) => m.version <= 23);
        applyMigrations(stale, upTo23);

        const applied = applyMigrations(stale, all);
        expect(applied).toContain(24);

        const staleRepo = new SqliteFormulaRepository(stale);
        await staleRepo.save(makeFormula({ active: true }));
        insertInvoiceLine(stale, 'invl_00000000000000000000000001', 'fml_00000000000000000000000001');

        await expect(
          staleRepo.save(makeFormula({ active: false, version: 1, updatedAt: new Date('2026-08-02T00:00:00Z') })),
        ).resolves.toBeUndefined();
        expect((await staleRepo.findById(makeFormula().id))?.active).toBe(false);
      } finally {
        stale.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
