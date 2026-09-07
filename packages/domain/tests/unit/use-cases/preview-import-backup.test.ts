import { describe, it, expect, beforeEach } from 'vitest';
import { PreviewImportBackup } from '../../../src/use-cases/preview-import-backup';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { planWithoutFeature } from '../fakes/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { BackupFileReadError } from '../../../src/errors/backup-errors';
import type { BackupWorkbook } from '../../../src/backup/backup-workbook';
import { InMemoryBackupStore } from '../fakes/in-memory-backup-store';
import { InMemoryBackupExcelPort } from '../fakes/in-memory-backup-excel-port';
import { CENTER, validBackupRow, validId } from '../backup/helpers';
import type { CenterCode } from '../../../src/value-objects/ids';

const PATH = '/tmp/import.xlsx';

describe('PreviewImportBackup', () => {
  let store: InMemoryBackupStore;
  let excel: InMemoryBackupExcelPort;
  let useCase: PreviewImportBackup;

  beforeEach(() => {
    store = new InMemoryBackupStore();
    excel = new InMemoryBackupExcelPort();
    useCase = new PreviewImportBackup(store, excel, new PlanPolicy(PLANS.pro));
  });

  async function seedWorkbook(sheets: BackupWorkbook['sheets']): Promise<void> {
    await excel.writeWorkbook(PATH, { sheets });
  }

  it('classifies a mixed workbook: created, updated, duplicate, invalid', async () => {
    const existingRoom = validBackupRow('rooms');
    const existingParent = validBackupRow('parents', { id: validId('prt'), naturalKey: `${CENTER}::dupe::x` });
    store.seed('rooms', [existingRoom]);
    store.seed('parents', [existingParent]);

    const newRoom = validBackupRow('rooms', { id: 'rom_01HWAAAAAAAAAAAAAAAAAAAAAB' });
    const updatedRoom = validBackupRow('rooms', { id: existingRoom['id'], capacity: 30 });
    const dupParent = validBackupRow('parents', { id: undefined, naturalKey: `${CENTER}::dupe::x` }, ['id', 'createdAt', 'updatedAt', 'updatedBy', 'deviceOrigin', 'version']);
    const invalidRoom = validBackupRow('rooms', { id: 'not-an-id' });

    await seedWorkbook([
      {
        name: 'rooms',
        columns: ['id', 'centerCode', 'createdAt', 'name', 'capacity', 'active'],
        rows: [newRoom, updatedRoom, invalidRoom],
      },
      {
        name: 'parents',
        columns: ['id', 'centerCode', 'naturalKey', 'name', 'phone'],
        rows: [dupParent],
      },
    ]);

    const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });

    expect(preview.unknownSheets).toEqual([]);
    expect(preview.counts).toEqual({ created: 1, updated: 1, duplicate: 1, invalid: 1 });
    expect(preview.rows).toHaveLength(4);

    const invalid = preview.rows.find((row) => row.status === 'invalid')!;
    expect(invalid.sheetName).toBe('rooms');
    expect(invalid.rowNumber).toBe(4);
    expect(invalid.reason).toContain('invalid-id');
  });

  it('reports unknown sheets without failing', async () => {
    await seedWorkbook([{ name: 'mystery-sheet', columns: ['a'], rows: [{ a: 'x' }] }]);
    const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(preview.unknownSheets).toEqual(['mystery-sheet']);
    expect(preview.counts).toEqual({ created: 0, updated: 0, duplicate: 0, invalid: 0 });
  });

  it('reports an existing id on a skip sheet as a duplicate, not updated (SOU-44 M2)', async () => {
    const existingPayment = validBackupRow('payments');
    store.seed('payments', [existingPayment]);

    await seedWorkbook([
      {
        name: 'payments',
        columns: ['id', 'centerCode', 'amountMad', 'invoiceId', 'kind', 'method', 'paidOn'],
        rows: [{ ...existingPayment, amountMad: 9999 }],
      },
    ]);

    const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(preview.counts).toEqual({ created: 0, updated: 0, duplicate: 1, invalid: 0 });
    const row = preview.rows[0]!;
    expect(row.status).toBe('duplicate');
    expect(row.reason).toBe('already-exists');
  });

  it('marks a second id-less row with the same naturalKey in one workbook as a duplicate', async () => {
    const sharedNaturalKey = `${CENTER}::same-person::x`;
    const row = (name: string) =>
      validBackupRow(
        'parents',
        { id: undefined, naturalKey: sharedNaturalKey, name },
        ['id', 'createdAt', 'updatedAt', 'updatedBy', 'deviceOrigin', 'version'],
      );

    await seedWorkbook([
      {
        name: 'parents',
        columns: ['id', 'centerCode', 'naturalKey', 'name', 'phone'],
        rows: [row('Premier'), row('Doublon')],
      },
    ]);

    const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(preview.counts).toEqual({ created: 1, updated: 0, duplicate: 1, invalid: 0 });
  });

  it('does not write anything during a preview', async () => {
    const existingRoom = validBackupRow('rooms');
    store.seed('rooms', [existingRoom]);
    await seedWorkbook([
      {
        name: 'rooms',
        columns: ['id', 'centerCode', 'createdAt', 'name', 'capacity', 'active'],
        rows: [validBackupRow('rooms', { id: 'rom_01HWAAAAAAAAAAAAAAAAAAAAAB' })],
      },
    ]);

    await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(store.allRows('rooms')).toHaveLength(1);
  });

  it('wraps a missing file in BackupFileReadError', async () => {
    await expect(
      useCase.execute({ filePath: '/tmp/does-not-exist.xlsx', centerCode: CENTER as CenterCode }),
    ).rejects.toBeInstanceOf(BackupFileReadError);
  });

  it('is locked on a plan without io.excel.import', async () => {
    useCase = new PreviewImportBackup(store, excel, new PlanPolicy(planWithoutFeature('io.excel.import')));
    await seedWorkbook([{ name: 'rooms', columns: ['id'], rows: [] }]);
    await expect(
      useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });

  describe('dangling references (SOU-317)', () => {
    it('reports the placeholder it will create for a missing catalog reference', async () => {
      const missingNiveau = validId('niv');
      const teacher = validBackupRow('teachers', { id: validId('tch'), niveauIds: missingNiveau, subjectIds: '' });

      await seedWorkbook([
        {
          name: 'teachers',
          columns: ['id', 'centerCode', 'naturalKey', 'name_fr', 'name_ar', 'phone', 'subjectIds', 'niveauIds', 'active'],
          rows: [teacher],
        },
      ]);

      const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
      expect(preview.counts).toEqual({ created: 2, updated: 0, duplicate: 0, invalid: 0 });
      const placeholderRow = preview.rows.find((row) => row.sheetName === 'niveaux');
      expect(placeholderRow).toEqual({ sheetName: 'niveaux', rowNumber: 0, status: 'created', reason: 'auto-created-placeholder' });
      const teacherRow = preview.rows.find((row) => row.sheetName === 'teachers')!;
      expect(teacherRow.status).toBe('created');
      expect(teacherRow.reason).toBeNull();
    });

    it('reports a dropped nullable link without failing the row', async () => {
      const missingGroup = validId('grp');
      const existingRoom = validBackupRow('rooms');
      store.seed('rooms', [existingRoom]);
      const wrs = validBackupRow('weekly-recurring-sessions', {
        id: validId('wrs'),
        groupId: missingGroup,
        teacherId: null,
        roomId: existingRoom['id'],
      });

      await seedWorkbook([
        {
          name: 'weekly-recurring-sessions',
          columns: ['id', 'centerCode', 'roomId', 'teacherId', 'groupId', 'dayOfWeek', 'start', 'end', 'active'],
          rows: [wrs],
        },
      ]);

      const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
      const row = preview.rows.find((r) => r.sheetName === 'weekly-recurring-sessions')!;
      expect(row.status).toBe('created');
      expect(row.reason).toBe('dropped-missing-link:groupId');
    });

    it('reports a row invalid when a required financial link is missing, and never invents a placeholder for it', async () => {
      const missingStudent = validId('stu');
      const missingFormula = validId('fml');
      const subscription = validBackupRow('student-subscriptions', {
        id: validId('sbs'),
        studentId: missingStudent,
        formulaId: missingFormula,
      });

      await seedWorkbook([
        {
          name: 'student-subscriptions',
          columns: ['id', 'centerCode', 'studentId', 'formulaId', 'kind', 'subjectIds', 'startMonth', 'endMonth'],
          rows: [subscription],
        },
      ]);

      const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
      expect(preview.counts).toEqual({ created: 0, updated: 0, duplicate: 0, invalid: 1 });
      const row = preview.rows[0]!;
      expect(row.status).toBe('invalid');
      expect(row.reason).toBe('missing-link:studentId;missing-link:formulaId');
      expect(preview.rows.some((r) => r.sheetName === 'students')).toBe(false);
      expect(preview.rows.some((r) => r.sheetName === 'formulas')).toBe(false);
    });
  });
});
