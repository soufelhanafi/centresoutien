import { describe, expect, it } from 'vitest';
import {
  getChangeLogEntityToRowMapper,
  subjectBackupRowToEntity,
} from '../../../src/data/sqlite/change-log/change-log-entity-mappers';

const ISO = '2026-07-29T10:00:00.000Z';

describe('getChangeLogEntityToRowMapper', () => {
  it('maps a domain Subject payload onto the physical subjects row', () => {
    const mapper = getChangeLogEntityToRowMapper('subjects');
    expect(mapper).toBeDefined();

    const row = mapper!({
      id: 'sub_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 3,
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
      code: 'MATH',
      active: true,
    });

    expect(row).toEqual({
      id: 'sub_01',
      center_code: 'CS-CASA-001',
      device_origin: 'dev_1',
      created_at: ISO,
      updated_at: ISO,
      updated_by: 'usr_1',
      deleted_at: null,
      version: 3,
      name_fr: 'Mathématiques',
      name_ar: 'الرياضيات',
      code: 'MATH',
      active: 1,
    });
  });

  it('accepts Date instances as well as ISO strings (pre-JSON domain entity)', () => {
    const mapper = getChangeLogEntityToRowMapper('subjects');
    const row = mapper!({
      id: 'sub_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO),
      updatedBy: 'usr_1',
      deletedAt: new Date(ISO),
      version: 0,
      name: { fr: 'M', ar: 'م' },
      code: null,
      active: false,
    });
    expect(row['created_at']).toBe(ISO);
    expect(row['deleted_at']).toBe(ISO);
    expect(row['active']).toBe(0);
  });

  it('falls back to the SHEET_SQL logical→physical registry for backup-sheet entityTypes', () => {
    const mapper = getChangeLogEntityToRowMapper('rooms');
    expect(mapper).toBeDefined();

    const row = mapper!({
      id: 'rom_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 1,
      name: 'Salle A',
      capacity: 20,
      active: true,
    });

    expect(row).toEqual({
      id: 'rom_01',
      center_code: 'CS-CASA-001',
      device_origin: 'dev_1',
      created_at: ISO,
      updated_at: ISO,
      updated_by: 'usr_1',
      deleted_at: null,
      version: 1,
      name: 'Salle A',
      capacity: 20,
      active: 1,
    });
  });

  it('returns undefined for an entityType neither registered nor a backup sheet', () => {
    expect(getChangeLogEntityToRowMapper('does-not-exist')).toBeUndefined();
  });

  it.each([
    [
      'student_subscriptions',
      { id: 'sbs_01', studentId: 'stu_1', formulaId: 'fml_1', kind: 'regular', subjectIds: 'sub_1,sub_2', startMonth: '2026-09', endMonth: null },
      { student_id: 'stu_1', formula_id: 'fml_1', subject_ids: '["sub_1","sub_2"]' },
    ],
    [
      'weekly_recurring_sessions',
      { id: 'wrs_01', roomId: 'rom_1', teacherId: 'tea_1', groupId: 'grp_1', dayOfWeek: 2, start: '09:00', end: '11:00', active: true, validFrom: ISO, validTo: null },
      { room_id: 'rom_1', day_of_week: 2, active: 1 },
    ],
    [
      'invoice_lines',
      { id: 'inl_01', invoiceId: 'inv_1', formulaId: 'fml_1', label_fr: 'Math', label_ar: 'رياضيات', kind: 'regular', amountMad: 20000 },
      { invoice_id: 'inv_1', amount_mad: 20000, label_fr: 'Math' },
    ],
    [
      'center_hours',
      { id: 'cen_01', dayOfWeek: 0, open: '08:00', close: '18:00' },
      { day_of_week: 0, open: '08:00', close: '18:00' },
    ],
  ] as const)(
    'resolves the fallback by PHYSICAL TABLE NAME for multi-word sheet %s (B1 regression)',
    (entityType, logicalRow, expectedPhysicalSubset) => {
      const mapper = getChangeLogEntityToRowMapper(entityType);
      expect(mapper).toBeDefined();

      const envelope: Record<string, unknown> = {
        id: (logicalRow as Record<string, unknown>)['id'],
        centerCode: 'CS-CASA-001',
        deviceOrigin: 'dev_1',
        createdAt: ISO,
        updatedAt: ISO,
        updatedBy: 'usr_1',
        deletedAt: null,
        version: 1,
      };
      const row = mapper!({ ...envelope, ...logicalRow });

      // The payload maps onto the snake_case physical row; the multi-word
      // sheet name (`student-subscriptions`) must NOT be treated as the key.
      expect(row).toMatchObject(expectedPhysicalSubset);
    },
  );
});

describe('subjectBackupRowToEntity', () => {
  it('converts the flat workbook subjects row to the canonical domain Subject', () => {
    const subject = subjectBackupRowToEntity({
      id: 'sub_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: ISO,
      version: 2,
      name_fr: 'Physique',
      name_ar: 'فيزياء',
      code: 'PC',
      active: true,
    });

    expect(subject).toEqual({
      id: 'sub_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO),
      updatedBy: 'usr_1',
      deletedAt: new Date(ISO),
      version: 2,
      name: { fr: 'Physique', ar: 'فيزياء' },
      code: 'PC',
      active: true,
    });
  });
});
