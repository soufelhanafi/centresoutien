import { describe, it, expect, beforeEach } from 'vitest';
import { ExportBackup } from '../../../src/use-cases/export-backup';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { planWithoutFeature } from '../fakes/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { BackupFileWriteError } from '../../../src/errors/backup-errors';
import { BACKUP_SHEET_NAMES, sheetColumnNames, findBackupSheet } from '../../../src/backup/backup-workbook';
import { InMemoryBackupStore } from '../fakes/in-memory-backup-store';
import { InMemoryBackupExcelPort } from '../fakes/in-memory-backup-excel-port';
import { validBackupRow } from '../backup/helpers';

describe('ExportBackup', () => {
  let store: InMemoryBackupStore;
  let excel: InMemoryBackupExcelPort;
  let useCase: ExportBackup;

  beforeEach(() => {
    store = new InMemoryBackupStore();
    excel = new InMemoryBackupExcelPort();
    useCase = new ExportBackup(store, excel, new PlanPolicy(PLANS.pro));
  });

  it('writes one workbook with every sheet, headers in registry order', async () => {
    const result = await useCase.execute({ filePath: '/tmp/backup.xlsx' });

    expect(result.filePath).toBe('/tmp/backup.xlsx');
    expect(excel.has('/tmp/backup.xlsx')).toBe(true);

    const workbook = await excel.readWorkbook('/tmp/backup.xlsx');
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([...BACKUP_SHEET_NAMES]);
    for (const sheet of workbook.sheets) {
      const spec = findBackupSheet(sheet.name)!;
      expect(sheet.columns).toEqual([...sheetColumnNames(spec)]);
      expect(sheet.rows).toHaveLength(0);
    }
  });

  it('round-trips the store rows through the workbook', async () => {
    const room = validBackupRow('rooms');
    store.seed('rooms', [room]);

    await useCase.execute({ filePath: '/tmp/backup.xlsx' });
    const workbook = await excel.readWorkbook('/tmp/backup.xlsx');
    const roomsSheet = workbook.sheets.find((sheet) => sheet.name === 'rooms')!;

    expect(roomsSheet.rows).toHaveLength(1);
    expect(roomsSheet.rows[0]!['id']).toBe(room['id']);
    expect(roomsSheet.rows[0]!['capacity']).toBe(1);
    expect(roomsSheet.rows[0]!['active']).toBe(false);
  });

  it('reports per-sheet row counts', async () => {
    store.seed('rooms', [validBackupRow('rooms'), validBackupRow('rooms', { id: 'rom_01HWAAAAAAAAAAAAAAAAAAAAAB' })]);
    const result = await useCase.execute({ filePath: '/tmp/backup.xlsx' });
    expect(result.counts['rooms']).toBe(2);
    expect(result.counts['students']).toBe(0);
  });

  it('is locked on a plan without io.excel.export', async () => {
    useCase = new ExportBackup(store, excel, new PlanPolicy(planWithoutFeature('io.excel.export')));
    await expect(useCase.execute({ filePath: '/tmp/backup.xlsx' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
    expect(excel.has('/tmp/backup.xlsx')).toBe(false);
  });

  it('wraps a write failure in BackupFileWriteError', async () => {
    excel.writeError = new Error('disk full');
    await expect(useCase.execute({ filePath: '/tmp/backup.xlsx' })).rejects.toBeInstanceOf(
      BackupFileWriteError,
    );
  });
});
