import { describe, it, expect, beforeEach } from 'vitest';
import { ApplyImportBackup } from '../../../src/use-cases/apply-import-backup';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { planWithoutFeature } from '../fakes/plans';
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

  async function seedWorkbook(sheets: BackupWorkbook['sheets']): Promise<void> {
    await excel.writeWorkbook(PATH, { sheets });
  }

  it('applies created + updated rows atomically across sheets in dependency order', async () => {
    const existingRoom = validBackupRow('rooms');
    store.seed('rooms', [existingRoom]);

    await seedWorkbook([
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

    await seedWorkbook([
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

    await seedWorkbook([
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

    await seedWorkbook([
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
    await seedWorkbook([{ name: 'mystery-sheet', columns: ['a'], rows: [{ a: 'x' }] }]);
    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 0, updated: 0, duplicate: 0, invalid: 0 });
    expect(store.applied).toHaveLength(0);
  });

  it('classifies an existing id on a skip sheet (payments) as a duplicate, never updated (SOU-44 M2)', async () => {
    const existingPayment = validBackupRow('payments');
    store.seed('payments', [existingPayment]);

    // Same id, tampered amount — the apply is a no-op, so the preview must not
    // claim it as an "updated" row (preview and apply stay in lockstep).
    await seedWorkbook([
      {
        name: 'payments',
        columns: ['id', 'centerCode', 'amountMad', 'invoiceId', 'kind', 'method', 'paidOn'],
        rows: [{ ...existingPayment, amountMad: 9999 }],
      },
    ]);

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 0, updated: 0, duplicate: 1, invalid: 0 });
    expect(store.applied).toHaveLength(0);
    expect(store.allRows('payments')[0]!['amountMad']).toBe(1);
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

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 1, updated: 0, duplicate: 1, invalid: 0 });
    expect(store.allRows('parents')).toHaveLength(1);
  });

  it('restores a legacy pre-SOU-197 center-hours row (open/close) as a windows row', async () => {
    const legacyOpen = {
      id: 'chr_01HWAAAAAAAAAAAAAAAAAAAAAA',
      centerCode: CENTER,
      deviceOrigin: 'dev_00000000000000000000000001',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
      updatedBy: 'usr_00000000000000000000000001',
      deletedAt: null,
      version: 0,
      dayOfWeek: 1,
      open: '09:00',
      close: '18:00',
    };
    const legacyClosed = { ...legacyOpen, id: 'chr_01HWAAAAAAAAAAAAAAAAAAAAAB', dayOfWeek: 2, open: null, close: null };

    await seedWorkbook([
      {
        name: 'center-hours',
        columns: ['id', 'centerCode', 'createdAt', 'dayOfWeek', 'open', 'close'],
        rows: [legacyOpen, legacyClosed],
      },
    ]);

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 2, updated: 0, duplicate: 0, invalid: 0 });

    const saved = store.allRows('center-hours');
    expect(saved.find((row) => row['dayOfWeek'] === 1)?.['windows']).toBe(
      JSON.stringify([{ open: '09:00', close: '18:00' }]),
    );
    expect(saved.find((row) => row['dayOfWeek'] === 2)?.['windows']).toBe('[]');
  });

  // SOU-271: exceljs reads a FR-only workbook's empty AR cell back as `null`.
  // Import must accept such a row (not reject it as bad-type) and persist name_ar
  // as '' so the NOT NULL column is satisfied — the AR-optional round-trip.
  it('accepts a student row whose AR name cell is blank (null) and persists name_ar as ""', async () => {
    await seedWorkbook([
      {
        name: 'students',
        columns: ['id', 'centerCode', 'naturalKey', 'name_fr', 'name_ar', 'birthDate', 'level', 'guardianIds'],
        rows: [validBackupRow('students', { id: validId('stu'), name_fr: 'Yassine', name_ar: null })],
      },
    ]);

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 1, updated: 0, duplicate: 0, invalid: 0 });
    expect(store.allRows('students')[0]!['name_ar']).toBe('');
  });

  it('skips a center-hours row whose windows cell is not valid window JSON', async () => {
    await seedWorkbook([
      {
        name: 'center-hours',
        columns: ['id', 'centerCode', 'dayOfWeek', 'windows'],
        rows: [validBackupRow('center-hours', { windows: 'not-json' })],
      },
    ]);

    const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
    expect(result.counts).toEqual({ created: 0, updated: 0, duplicate: 0, invalid: 1 });
    expect(store.allRows('center-hours')).toHaveLength(0);
  });

  it('wraps a store failure in BackupImportApplyError (atomic rollback)', async () => {
    store.applyError = new Error('UNIQUE constraint failed');
    await seedWorkbook([
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
    useCase = new ApplyImportBackup(store, excel, new PlanPolicy(planWithoutFeature('io.excel.import')), fakeClock(), fakeIds(), DEVICE, USER);
    await seedWorkbook([{ name: 'rooms', columns: ['id'], rows: [] }]);
    await expect(
      useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });

  it('iterates known sheets in the registry (dependency) order', async () => {
    await seedWorkbook([
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

  describe('dangling references (SOU-317)', () => {
    it('creates a placeholder niveau for a teacher referencing one that does not exist', async () => {
      const missingNiveau = validId('niv');
      const teacher = validBackupRow('teachers', { id: validId('tch'), niveauIds: missingNiveau, subjectIds: '' });

      await seedWorkbook([
        {
          name: 'teachers',
          columns: ['id', 'centerCode', 'naturalKey', 'name_fr', 'name_ar', 'phone', 'subjectIds', 'niveauIds', 'active'],
          rows: [teacher],
        },
      ]);

      const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });

      expect(result.counts).toEqual({ created: 2, updated: 0, duplicate: 0, invalid: 0 });
      expect(store.allRows('teachers')[0]!['niveauIds']).toBe(missingNiveau);
      const placeholder = store.allRows('niveaux').find((row) => row['id'] === missingNiveau);
      expect(placeholder).toBeDefined();
      expect(placeholder!['centerCode']).toBe(CENTER);
      expect(placeholder!['active']).toBe(true);
      // niveaux is applied before teachers in registry order, so the FK-free
      // reference resolves regardless of write order — but placeholders still
      // land on their own sheet.
      expect(store.applied.map((sheet) => sheet.sheetName)).toEqual(['teachers', 'niveaux']);
    });

    it('reuses one placeholder when two rows reference the same missing parent', async () => {
      const missingParent = validId('prt');
      const studentA = validBackupRow('students', { id: validId('stu', '01HWAAAAAAAAAAAAAAAAAAAAA1'), guardianIds: missingParent });
      const studentB = validBackupRow('students', { id: validId('stu', '01HWAAAAAAAAAAAAAAAAAAAAA2'), guardianIds: missingParent });

      await seedWorkbook([
        {
          name: 'students',
          columns: ['id', 'centerCode', 'naturalKey', 'name_fr', 'name_ar', 'guardianIds'],
          rows: [studentA, studentB],
        },
      ]);

      const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });

      expect(result.counts).toEqual({ created: 3, updated: 0, duplicate: 0, invalid: 0 });
      expect(store.allRows('parents')).toHaveLength(1);
      expect(store.allRows('parents')[0]!['id']).toBe(missingParent);
    });

    it('drops a nullable link that points nowhere and still applies the row', async () => {
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

      const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
      expect(result.counts.invalid).toBe(0);
      expect(store.allRows('weekly-recurring-sessions')[0]!['groupId']).toBeNull();
    });

    it('rejects a row whose required link points nowhere, without touching the rest of the import', async () => {
      const missingStudent = validId('stu');
      const missingFormula = validId('fml');
      const room = validBackupRow('rooms', { id: validId('rom') });
      const subscription = validBackupRow('student-subscriptions', {
        id: validId('sbs'),
        studentId: missingStudent,
        formulaId: missingFormula,
      });

      await seedWorkbook([
        { name: 'rooms', columns: ['id', 'centerCode', 'name', 'capacity', 'active'], rows: [room] },
        {
          name: 'student-subscriptions',
          columns: ['id', 'centerCode', 'studentId', 'formulaId', 'kind', 'subjectIds', 'startMonth', 'endMonth'],
          rows: [subscription],
        },
      ]);

      const result = await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
      expect(result.counts).toEqual({ created: 1, updated: 0, duplicate: 0, invalid: 1 });
      expect(store.allRows('student-subscriptions')).toHaveLength(0);
      expect(store.allRows('rooms')).toHaveLength(1);
      // no placeholder student/formula — those are financial links, never fabricated
      expect(store.allRows('students')).toHaveLength(0);
      expect(store.allRows('formulas')).toHaveLength(0);
    });

    it('never fabricates a placeholder over a real existing row when its sheet is omitted from the workbook', async () => {
      const realParent = validBackupRow('parents', { id: validId('prt'), name: 'Fatima Zahra Alaoui' });
      store.seed('parents', [realParent]);

      const student = validBackupRow('students', { id: validId('stu'), guardianIds: realParent['id'] as string });
      // The workbook carries only `students` — `parents` is entirely absent,
      // exactly the "older/partial export" case the reference-repair feature
      // must not treat as "this parent doesn't exist".
      await seedWorkbook([
        {
          name: 'students',
          columns: ['id', 'centerCode', 'naturalKey', 'name_fr', 'name_ar', 'guardianIds'],
          rows: [student],
        },
      ]);

      await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });

      expect(store.allRows('parents')).toHaveLength(1);
      expect(store.allRows('parents')[0]!['name']).toBe('Fatima Zahra Alaoui');
      expect(store.applied.some((sheet) => sheet.sheetName === 'parents')).toBe(false);
    });

    it('does not drop a nullable link into a sheet omitted from the workbook when its target really exists', async () => {
      const realGroup = validBackupRow('groups', { id: validId('grp') });
      store.seed('groups', [realGroup]);
      const room = validBackupRow('rooms');
      store.seed('rooms', [room]);

      const wrs = validBackupRow('weekly-recurring-sessions', {
        id: validId('wrs'),
        groupId: realGroup['id'],
        teacherId: null,
        roomId: room['id'],
      });
      // `groups` is entirely absent from this workbook — only its existing DB
      // row should decide whether the reference resolves.
      await seedWorkbook([
        {
          name: 'weekly-recurring-sessions',
          columns: ['id', 'centerCode', 'roomId', 'teacherId', 'groupId', 'dayOfWeek', 'start', 'end', 'active'],
          rows: [wrs],
        },
      ]);

      await useCase.execute({ filePath: PATH, centerCode: CENTER as CenterCode });
      expect(store.allRows('weekly-recurring-sessions')[0]!['groupId']).toBe(realGroup['id']);
    });
  });
});
