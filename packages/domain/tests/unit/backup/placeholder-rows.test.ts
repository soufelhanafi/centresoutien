import { describe, it, expect } from 'vitest';
import { buildPlaceholderRow } from '../../../src/backup/placeholder-rows';
import { findBackupSheet } from '../../../src/backup/backup-workbook';
import { validateBackupRow } from '../../../src/backup/classify-rows';
import { CENTER, validId } from './helpers';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const CENTER_CODE = CENTER as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const NOW = '2026-07-28T10:00:00.000Z';

describe('buildPlaceholderRow', () => {
  it.each(['parents', 'teachers', 'rooms', 'subjects', 'niveaux'] as const)(
    'builds a %s placeholder that passes the sheet\'s own structural validation',
    (sheetName) => {
      const spec = findBackupSheet(sheetName)!;
      const id = validId(spec.idPrefix);
      const row = buildPlaceholderRow(spec, id, CENTER_CODE, NOW, DEVICE, USER);

      expect(row['id']).toBe(id);
      expect(row['centerCode']).toBe(CENTER_CODE);
      expect(row['deletedAt']).toBeNull();
      expect(row['version']).toBe(0);
      expect(validateBackupRow(spec, row)).toEqual([]);
    },
  );

  it('keeps the exact referenced id — the reference only resolves under that id', () => {
    const spec = findBackupSheet('teachers')!;
    const id = validId('tch');
    const row = buildPlaceholderRow(spec, id, CENTER_CODE, NOW, DEVICE, USER);
    expect(row['id']).toBe(id);
  });

  it('synthesizes a naturalKey for people-like sheets, unique to the id', () => {
    const spec = findBackupSheet('parents')!;
    const id = validId('prt');
    const row = buildPlaceholderRow(spec, id, CENTER_CODE, NOW, DEVICE, USER);
    expect(row['naturalKey']).toBe(`${CENTER_CODE}::placeholder::${id}`);
  });

  it('does not set a naturalKey for a non-people-like sheet', () => {
    const spec = findBackupSheet('rooms')!;
    const row = buildPlaceholderRow(spec, validId('rom'), CENTER_CODE, NOW, DEVICE, USER);
    expect(row['naturalKey']).toBeUndefined();
  });

  it('marks the placeholder active so it is usable immediately', () => {
    const spec = findBackupSheet('subjects')!;
    const row = buildPlaceholderRow(spec, validId('sub'), CENTER_CODE, NOW, DEVICE, USER);
    expect(row['active']).toBe(true);
  });

  it('picks a valid niveaux category so the CHECK constraint holds', () => {
    const spec = findBackupSheet('niveaux')!;
    const row = buildPlaceholderRow(spec, validId('niv'), CENTER_CODE, NOW, DEVICE, USER);
    expect(['primaire', 'college', 'lycee']).toContain(row['category']);
  });

  it('throws for a sheet that is never a catalog reference target', () => {
    const spec = findBackupSheet('groups')!;
    expect(() => buildPlaceholderRow(spec, validId('grp'), CENTER_CODE, NOW, DEVICE, USER)).toThrow();
  });
});
