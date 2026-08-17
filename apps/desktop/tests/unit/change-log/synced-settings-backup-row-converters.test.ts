import { describe, expect, it } from 'vitest';
import {
  centerHoursOverrideBackupRowToEntity,
  getRegisteredChangeLogEntityToRowMapper,
  teacherAvailabilityBackupRowToEntity,
  teacherAvailabilityExceptionBackupRowToEntity,
} from '../../../src/data/sqlite/change-log/change-log-entity-mappers';
import { SHEET_BY_TABLE } from '../../../src/data/sqlite/repositories/backup-store-sheets';

const ISO = '2026-07-29T10:00:00.000Z';

const EMPTY_WEEK = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

function weekWith(day: number, windows: readonly { open: string; close: string }[]): string {
  return JSON.stringify({ ...EMPTY_WEEK, [day]: windows });
}

describe('synced-settings registered mappers stay in sync with the backup-sheet registry (SOU-264)', () => {
  it('each registered domain mapper covers exactly the sheet registry columns', () => {
    const cases = [
      {
        entityType: 'center_hours_overrides' as const,
        entity: {
          id: 'cho_01',
          centerCode: 'CS-CASA-001',
          deviceOrigin: 'dev_1',
          createdAt: ISO,
          updatedAt: ISO,
          updatedBy: 'usr_1',
          deletedAt: null,
          version: 1,
          dateRange: { start: '2026-02-18', end: '2026-03-19' },
          hoursByWeekday: EMPTY_WEEK,
        },
      },
      {
        entityType: 'teacher_availability' as const,
        entity: {
          id: 'tav_01',
          centerCode: 'CS-CASA-001',
          deviceOrigin: 'dev_1',
          createdAt: ISO,
          updatedAt: ISO,
          updatedBy: 'usr_1',
          deletedAt: null,
          version: 1,
          teacherId: 'tch_1',
          weeklyWindows: EMPTY_WEEK,
        },
      },
      {
        entityType: 'teacher_availability_exceptions' as const,
        entity: {
          id: 'tae_01',
          centerCode: 'CS-CASA-001',
          deviceOrigin: 'dev_1',
          createdAt: ISO,
          updatedAt: ISO,
          updatedBy: 'usr_1',
          deletedAt: null,
          version: 1,
          teacherId: 'tch_1',
          dateRange: { start: '2026-05-01', end: '2026-05-15' },
          label: null,
        },
      },
    ];
    for (const { entityType, entity } of cases) {
      const config = SHEET_BY_TABLE.get(entityType);
      const mapper = getRegisteredChangeLogEntityToRowMapper(entityType);
      expect(config).toBeDefined();
      expect(mapper).toBeDefined();
      const expectedColumns = config!.columns.map(([, sql]) => sql).sort();
      const actualColumns = Object.keys(mapper!(entity)).sort();
      expect(actualColumns).toEqual(expectedColumns);
    }
  });
});

describe('centerHoursOverrideBackupRowToEntity', () => {
  it('converts the flat row to the domain override, parsing the JSON windows', () => {
    const override = centerHoursOverrideBackupRowToEntity({
      id: 'cho_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 1,
      startDate: '2026-02-18',
      endDate: '2026-03-19',
      hoursByWeekday: weekWith(0, [{ open: '09:00', close: '15:00' }, { open: '21:00', close: '23:00' }]),
    });

    expect(override).toEqual({
      id: 'cho_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO),
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 1,
      dateRange: { start: '2026-02-18', end: '2026-03-19' },
      hoursByWeekday: {
        0: [{ open: '09:00', close: '15:00' }, { open: '21:00', close: '23:00' }],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
      },
    });
  });

  it('rejects a weekly-window cell that is not valid weekly-window JSON', () => {
    expect(() =>
      centerHoursOverrideBackupRowToEntity({
        id: 'cho_02',
        centerCode: 'CS-CASA-001',
        deviceOrigin: 'dev_1',
        createdAt: ISO,
        updatedAt: ISO,
        updatedBy: 'usr_1',
        deletedAt: null,
        version: 0,
        startDate: '2026-02-18',
        endDate: '2026-03-19',
        hoursByWeekday: weekWith(0, [{ open: '09:00', close: '09:00' }]),
      }),
    ).toThrow(/weekly-window/);
  });
});

describe('teacherAvailabilityBackupRowToEntity', () => {
  it('converts the flat row to the domain availability', () => {
    const availability = teacherAvailabilityBackupRowToEntity({
      id: 'tav_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 0,
      teacherId: 'tch_01',
      weeklyWindows: weekWith(0, [{ open: '08:00', close: '12:00' }]),
    });

    expect(availability).toEqual({
      id: 'tav_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO),
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 0,
      teacherId: 'tch_01',
      weeklyWindows: {
        0: [{ open: '08:00', close: '12:00' }],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
      },
    });
  });

  it('rejects a weekly-window cell that is not valid weekly-window JSON', () => {
    expect(() =>
      teacherAvailabilityBackupRowToEntity({
        id: 'tav_02',
        centerCode: 'CS-CASA-001',
        deviceOrigin: 'dev_1',
        createdAt: ISO,
        updatedAt: ISO,
        updatedBy: 'usr_1',
        deletedAt: null,
        version: 0,
        teacherId: 'tch_01',
        weeklyWindows: 'not-json',
      }),
    ).toThrow(/weekly-window/);
  });
});

describe('teacherAvailabilityExceptionBackupRowToEntity', () => {
  it('converts the flat row to the domain exception', () => {
    const exception = teacherAvailabilityExceptionBackupRowToEntity({
      id: 'tae_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 0,
      teacherId: 'tch_01',
      startDate: '2026-05-01',
      endDate: '2026-05-15',
      label: null,
    });

    expect(exception).toEqual({
      id: 'tae_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO),
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 0,
      teacherId: 'tch_01',
      dateRange: { start: '2026-05-01', end: '2026-05-15' },
      label: null,
    });
  });
});
