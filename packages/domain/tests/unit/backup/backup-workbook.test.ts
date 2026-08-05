import { describe, it, expect } from 'vitest';
import {
  BACKUP_ENVELOPE_COLUMNS,
  BACKUP_SHEETS,
  BACKUP_SHEET_NAMES,
  findBackupSheet,
  sheetColumnNames,
} from '../../../src/backup/backup-workbook';

describe('backup workbook registry', () => {
  it('has exactly the 16 confirmed sheets, in import dependency order', () => {
    expect(BACKUP_SHEET_NAMES).toEqual([
      'parents',
      'students',
      'teachers',
      'rooms',
      'subjects',
      'groups',
      'formulas',
      'student-subscriptions',
      'enrollments',
      'weekly-recurring-sessions',
      'sessions',
      'invoices',
      'invoice-lines',
      'payments',
      'center-hours',
      'holidays',
    ]);
    expect(BACKUP_SHEETS).toHaveLength(BACKUP_SHEET_NAMES.length);
  });

  it('orders BACKUP_SHEETS identically to BACKUP_SHEET_NAMES', () => {
    expect(BACKUP_SHEETS.map((sheet) => sheet.name)).toEqual([...BACKUP_SHEET_NAMES]);
  });

  it('gives every sheet a unique id prefix', () => {
    const prefixes = new Set(BACKUP_SHEETS.map((sheet) => sheet.idPrefix));
    expect(prefixes.size).toBe(BACKUP_SHEETS.length);
  });

  it('carries the full envelope on every sheet, and naturalKey exactly on people-like sheets', () => {
    const envelopeNames = BACKUP_ENVELOPE_COLUMNS.map((column) => column.name);
    for (const spec of BACKUP_SHEETS) {
      for (const column of envelopeNames) {
        expect(spec.columns.some((candidate) => candidate.name === column)).toBe(true);
      }
      expect(spec.peopleLike).toBe(spec.naturalKeyColumn !== null);
      const hasNaturalKey = spec.columns.some((column) => column.name === 'naturalKey');
      expect(hasNaturalKey).toBe(spec.peopleLike);
      if (spec.peopleLike) {
        expect(spec.columns.some((column) => column.name === spec.naturalKeyColumn)).toBe(true);
      }
    }
  });

  it('marks exactly the append-only / immutable sheets as restoreConflict skip', () => {
    const skipSheets = new Set(BACKUP_SHEETS.filter((spec) => spec.restoreConflict === 'skip').map((spec) => spec.name));
    expect(skipSheets).toEqual(new Set(['payments', 'formulas']));
    for (const spec of BACKUP_SHEETS) {
      expect(spec.restoreConflict).toMatch(/^(upsert|skip)$/);
    }
  });

  it('keeps parents before students before all dependents', () => {
    const parents = BACKUP_SHEET_NAMES.indexOf('parents');
    const students = BACKUP_SHEET_NAMES.indexOf('students');
    const dependents = BACKUP_SHEET_NAMES.slice(students + 1);
    expect(parents).toBeLessThan(students);
    for (const dependent of dependents) {
      expect(students).toBeLessThan(BACKUP_SHEET_NAMES.indexOf(dependent));
    }
  });

  it('findBackupSheet resolves known names and rejects unknown ones', () => {
    expect(findBackupSheet('students')?.idPrefix).toBe('stu');
    expect(findBackupSheet('nope')).toBeNull();
  });

  it('sheetColumnNames returns the header in registry order', () => {
    const columns = sheetColumnNames(findBackupSheet('rooms')!);
    expect(columns[0]).toBe('id');
    expect(columns).toContain('centerCode');
    expect(columns).toContain('capacity');
  });
});
