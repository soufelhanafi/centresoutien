import { describe, it, expect, beforeEach } from 'vitest';
import { PreviewImportBackup } from '../../../src/use-cases/preview-import-backup';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
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

  function seedWorkbook(sheets: BackupWorkbook['sheets']): void {
    excel.writeWorkbook(PATH, { sheets });
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

    seedWorkbook([
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
    seedWorkbook([{ name: 'mystery-sheet', columns: ['a'], rows: [{ a: 'x' }] }]);
    const preview = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(preview.unknownSheets).toEqual(['mystery-sheet']);
    expect(preview.counts).toEqual({ created: 0, updated: 0, duplicate: 0, invalid: 0 });
  });

  it('does not write anything during a preview', async () => {
    const existingRoom = validBackupRow('rooms');
    store.seed('rooms', [existingRoom]);
    seedWorkbook([
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
    useCase = new PreviewImportBackup(store, excel, new PlanPolicy(PLANS.essentiel));
    seedWorkbook([{ name: 'rooms', columns: ['id'], rows: [] }]);
    await expect(
      useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
