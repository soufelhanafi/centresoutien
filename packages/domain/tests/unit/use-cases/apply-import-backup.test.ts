import { describe, it, expect, beforeEach } from 'vitest';
import { ApplyImportBackup } from '../../../src/use-cases/apply-import-backup';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { BackupImportApplyError } from '../../../src/errors/backup-errors';
import type { BackupWorkbook } from '../../../src/backup/backup-workbook';
import { BACKUP_SHEET_NAMES } from '../../../src/backup/backup-workbook';
import { InMemoryBackupStore } from '../fakes/in-memory-backup-store';
import { InMemoryBackupExcelPort } from '../fakes/in-memory-backup-excel-port';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { CENTER, validBackupRow, validId } from '../backup/helpers';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const PATH = '/tmp/import.xlsx';
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('ApplyImportBackup', () => {
  let store: InMemoryBackupStore;
  let excel: InMemoryBackupExcelPort;
  let useCase: ApplyImportBackup;

  beforeEach(() => {
    store = new InMemoryBackupStore();
    excel = new InMemoryBackupExcelPort();
    useCase = new ApplyImportBackup(
      store,
      excel,
      new PlanPolicy(PLANS.pro),
      fakeClock('2026-07-28T10:00:00Z'),
      fakeIds(100),
      DEVICE,
      USER,
    );
  });

  function seedWorkbook(sheets: BackupWorkbook['sheets']): void {
    excel.writeWorkbook(PATH, { sheets });
  }

  it('applies created + updated rows atomically across sheets in dependency order', async () => {
    const existingRoom = validBackupRow('rooms');
    store.seed('rooms', [existingRoom]);

    seedWorkbook([
      {
        name: 'rooms',
        columns: ['id', 'centerCode', 'createdAt', 'name', 'capacity', 'active'],
        rows: [
          validBackupRow('rooms', { id: 'rom_01HWAAAAAAAAAAAAAAAAAAAAAB' }),
          validBackupRow('rooms', { id: existingRoom['id'], capacity: 30 }),
        ],
      },
    ]);

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });

    expect(result.counts).toEqual({ created: 1, updated: 1, duplicate: 0, invalid: 0 });
    expect(store.allRows('rooms')).toHaveLength(2);
    // the updated row kept its identity and applied the capacity change
    expect(store.allRows('rooms').find((row) => row['id'] === existingRoom['id'])?.['capacity']).toBe(30);
    // sheets were applied in registry order
    expect(store.applied.map((sheet) => sheet.sheetName)).toEqual(['rooms']);
  });

  it('stamps applied rows as edits now so the sync change feed picks them up', async () => {
    const existingRoom = validBackupRow('rooms');
    store.seed('rooms', [existingRoom]);

    seedWorkbook([
      {
        name: 'rooms',
        columns: ['id', 'centerCode', 'createdAt', 'name', 'capacity', 'active'],
        rows: [validBackupRow('rooms', { id: existingRoom['id'], updatedAt: '2020-01-01T00:00:00.000Z', updatedBy: 'usr_old' })],
      },
    ]);

    await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });

    const applied = store.allRows('rooms')[0]!;
    expect(applied['updatedAt']).toBe('2026-07-28T10:00:00.000Z');
    expect(applied['updatedBy']).toBe(USER);
  });

  it('mints a fresh ULID + envelope for an id-less people-like row', async () => {
    const newParent = validBackupRow(
      'parents',
      { id: undefined, naturalKey: `${CENTER}::new-parent::x`, name: 'Nouveau Parent' },
      ['id', 'createdAt', 'updatedAt', 'updatedBy', 'deviceOrigin', 'version'],
    );

    seedWorkbook([
      {
        name: 'parents',
        columns: ['id', 'centerCode', 'naturalKey', 'name', 'phone'],
        rows: [newParent],
      },
    ]);

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts.created).toBe(1);

    const saved = store.allRows('parents')[0]!;
    expect(saved['id']).toBe(`prt_${'100'.padStart(26, '0')}`);
    expect(saved['naturalKey']).toBe(`${CENTER}::new-parent::x`);
    expect(saved['deviceOrigin']).toBe(DEVICE);
    expect(saved['updatedBy']).toBe(USER);
    expect(saved['createdAt']).toBe('2026-07-28T10:00:00.000Z');
    expect(saved['version']).toBe(0);
  });

  it('skips duplicates and invalid rows, and reports them in the counts', async () => {
    const existingParent = validBackupRow('parents', { id: validId('prt'), naturalKey: `${CENTER}::dupe::x` });
    store.seed('parents', [existingParent]);

    const dupParent = validBackupRow('parents', { id: undefined, naturalKey: `${CENTER}::dupe::x` }, ['id', 'createdAt', 'updatedAt', 'updatedBy', 'deviceOrigin', 'version']);
    const badRoom = validBackupRow('rooms', { id: 'not-an-id' });

    seedWorkbook([
      {
        name: 'parents',
        columns: ['id', 'centerCode', 'naturalKey', 'name', 'phone'],
        rows: [dupParent],
      },
      {
        name: 'rooms',
        columns: ['id', 'centerCode', 'name', 'capacity', 'active'],
        rows: [badRoom],
      },
    ]);

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 0, updated: 0, duplicate: 1, invalid: 1 });
    expect(result.totalRows).toBe(2);
    expect(store.allRows('parents')).toHaveLength(1);
    expect(store.allRows('rooms')).toHaveLength(0);
  });

  it('does not call applyRows when nothing is applicable', async () => {
    seedWorkbook([{ name: 'mystery-sheet', columns: ['a'], rows: [{ a: 'x' }] }]);
    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 0, updated: 0, duplicate: 0, invalid: 0 });
    expect(store.applied).toHaveLength(0);
  });

  it('wraps a store failure in BackupImportApplyError (atomic rollback)', async () => {
    store.applyError = new Error('UNIQUE constraint failed');
    seedWorkbook([
      {
        name: 'rooms',
        columns: ['id', 'centerCode', 'name', 'capacity', 'active'],
        rows: [validBackupRow('rooms', { id: 'rom_01HWAAAAAAAAAAAAAAAAAAAAAB' })],
      },
    ]);

    await expect(
      useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode }),
    ).rejects.toBeInstanceOf(BackupImportApplyError);
  });

  it('is locked on a plan without io.excel.import', async () => {
    useCase = new ApplyImportBackup(store, excel, new PlanPolicy(PLANS.essentiel), fakeClock(), fakeIds(), DEVICE, USER);
    seedWorkbook([{ name: 'rooms', columns: ['id'], rows: [] }]);
    await expect(
      useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });

  it('iterates known sheets in the registry (dependency) order', async () => {
    seedWorkbook([
      {
        name: 'parents',
        columns: ['id', 'centerCode', 'naturalKey', 'name', 'phone'],
        rows: [validBackupRow('parents', { id: validId('prt') })],
      },
      {
        name: 'students',
        columns: ['id', 'centerCode', 'naturalKey', 'name_fr', 'name_ar'],
        rows: [validBackupRow('students', { id: validId('stu') })],
      },
      {
        name: 'sessions',
        columns: ['id', 'centerCode', 'date', 'start', 'end'],
        rows: [validBackupRow('sessions', { id: validId('ses') })],
      },
    ]);
    await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(store.applied.map((sheet) => sheet.sheetName)).toEqual(['parents', 'students', 'sessions']);
    expect(BACKUP_SHEET_NAMES.indexOf('parents')).toBeLessThan(BACKUP_SHEET_NAMES.indexOf('students'));
  });
});
