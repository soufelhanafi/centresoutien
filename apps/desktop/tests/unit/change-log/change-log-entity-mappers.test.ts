import { describe, expect, it } from 'vitest';
import {
  getChangeLogEntityToRowMapper,
  getRegisteredChangeLogEntityToRowMapper,
  subjectBackupRowToEntity,
} from '../../../src/data/sqlite/change-log/change-log-entity-mappers';
import { SHEET_BY_TABLE } from '../../../src/data/sqlite/repositories/backup-store-sheets';

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

  it('never writes readOnly columns on replay (formulas is_immutable is DB-owned)', () => {
    const mapper = getChangeLogEntityToRowMapper('formulas');
    expect(mapper).toBeDefined();

    // The flat payload may carry `isImmutable` (from the workbook), but the
    // backup-store itself refuses to write it — replay must too, so a replayed
    // row cannot fabricate a frozen formula.
    const row = mapper!({
      id: 'fml_01',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 1,
      name_fr: 'Math',
      name_ar: 'رياضيات',
      subjectIds: 'sub_1',
      priceMad: 20000,
      kind: 'regular',
      isImmutable: true,
      active: true,
    });

    expect(row['is_immutable']).toBeUndefined();
    expect(row['name_fr']).toBe('Math');
    expect(row['active']).toBe(1);
  });
});

describe('getRegisteredChangeLogEntityToRowMapper (sync-apply projection, SOU-132)', () => {
  it.each([
    [
      'weekly_recurring_sessions',
      {
        id: 'wrs_01',
        centerCode: 'CS-CASA-001',
        deviceOrigin: 'dev_1',
        createdAt: ISO,
        updatedAt: ISO,
        updatedBy: 'usr_1',
        deletedAt: null,
        version: 2,
        roomId: 'rom_1',
        teacherId: 'tch_1',
        groupId: 'grp_1',
        dayOfWeek: 2,
        start: '09:00',
        end: '11:00',
        active: true,
        validFrom: '2026-09-01',
        validTo: null,
        conflictAccepted: false,
      },
      {
        id: 'wrs_01',
        center_code: 'CS-CASA-001',
        device_origin: 'dev_1',
        created_at: ISO,
        updated_at: ISO,
        updated_by: 'usr_1',
        deleted_at: null,
        version: 2,
        room_id: 'rom_1',
        teacher_id: 'tch_1',
        group_id: 'grp_1',
        day_of_week: 2,
        start_time: '09:00',
        end_time: '11:00',
        active: 1,
        valid_from: '2026-09-01',
        valid_to: null,
        conflict_accepted: 0,
      },
    ],
    [
      'sessions',
      {
        id: 'ses_01',
        centerCode: 'CS-CASA-001',
        deviceOrigin: 'dev_1',
        createdAt: ISO,
        updatedAt: ISO,
        updatedBy: 'usr_1',
        deletedAt: null,
        version: 1,
        recurringSessionId: 'wrs_01',
        generationBatchId: null,
        roomId: 'rom_1',
        teacherId: null,
        groupId: 'grp_2',
        date: '2026-09-05',
        start: '09:00',
        end: '10:30',
      },
      {
        id: 'ses_01',
        center_code: 'CS-CASA-001',
        device_origin: 'dev_1',
        created_at: ISO,
        updated_at: ISO,
        updated_by: 'usr_1',
        deleted_at: null,
        version: 1,
        recurring_session_id: 'wrs_01',
        generation_batch_id: null,
        room_id: 'rom_1',
        teacher_id: null,
        group_id: 'grp_2',
        date: '2026-09-05',
        start_time: '09:00',
        end_time: '10:30',
      },
    ],
  ] as const)(
    'maps a %s domain payload onto the physical row, group_id included',
    (entityType, entity, expectedRow) => {
      const mapper = getRegisteredChangeLogEntityToRowMapper(entityType);
      expect(mapper).toBeDefined();
      expect(mapper!(entity)).toEqual(expectedRow);
    },
  );

  it('maps a null groupId onto null group_id (unlinked session)', () => {
    const mapper = getRegisteredChangeLogEntityToRowMapper('weekly_recurring_sessions')!;
    const row = mapper({
      id: 'wrs_02',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 0,
      roomId: 'rom_1',
      teacherId: null,
      groupId: null,
      dayOfWeek: 1,
      start: '09:00',
      end: '10:00',
      active: true,
      validFrom: null,
      validTo: null,
    });
    expect(row['group_id']).toBeNull();
  });

  it('projects a tombstoned session payload onto deleted_at', () => {
    const mapper = getRegisteredChangeLogEntityToRowMapper('sessions')!;
    const row = mapper({
      id: 'ses_02',
      centerCode: 'CS-CASA-001',
      deviceOrigin: 'dev_1',
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: 'usr_1',
      deletedAt: ISO,
      version: 3,
      recurringSessionId: 'wrs_01',
      generationBatchId: null,
      roomId: 'rom_1',
      teacherId: null,
      groupId: 'grp_1',
      date: '2026-09-06',
      start: '09:00',
      end: '10:30',
    });
    expect(row['deleted_at']).toBe(ISO);
  });

  it('explicit mappers stay in sync with the backup-sheet column registry', () => {
    const cases = [
      {
        entityType: 'weekly_recurring_sessions' as const,
        entity: {
          id: 'wrs_01',
          centerCode: 'CS-CASA-001',
          deviceOrigin: 'dev_1',
          createdAt: ISO,
          updatedAt: ISO,
          updatedBy: 'usr_1',
          deletedAt: null,
          version: 2,
          roomId: 'rom_1',
          teacherId: 'tch_1',
          groupId: 'grp_1',
          dayOfWeek: 2,
          start: '09:00',
          end: '11:00',
          active: true,
          validFrom: '2026-09-01',
          validTo: null,
        },
      },
      {
        entityType: 'sessions' as const,
        entity: {
          id: 'ses_01',
          centerCode: 'CS-CASA-001',
          deviceOrigin: 'dev_1',
          createdAt: ISO,
          updatedAt: ISO,
          updatedBy: 'usr_1',
          deletedAt: null,
          version: 1,
          recurringSessionId: 'wrs_01',
          generationBatchId: null,
          roomId: 'rom_1',
          teacherId: null,
          groupId: 'grp_2',
          date: '2026-09-05',
          start: '09:00',
          end: '10:30',
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
