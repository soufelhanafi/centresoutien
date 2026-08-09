import { describe, it, expect } from 'vitest';
import { findBackupSheet, type BackupRow } from '../../../src/backup/backup-workbook';
import { classifyImportRow, validateBackupRow } from '../../../src/backup/classify-rows';
import type { CenterCode } from '../../../src/value-objects/ids';
import { CENTER, validBackupRow, validId } from './helpers';

const CENTER_CODE = CENTER as CenterCode;

function classify(sheet: 'parents' | 'students' | 'rooms' | 'payments', row: BackupRow, existing: BackupRow[] = []) {
  const spec = findBackupSheet(sheet)!;
  const existingIds = new Set(existing.map((r) => r['id'] as string));
  const existingNaturalKeys = new Set(
    existing
      .filter((r) => r['deletedAt'] === null)
      .map((r) => r[spec.naturalKeyColumn ?? 'naturalKey'] as string),
  );
  return classifyImportRow({
    spec,
    row,
    existingIds,
    existingNaturalKeys,
    centerCode: CENTER_CODE,
  });
}

describe('classifyImportRow', () => {
  describe('id-carrying rows', () => {
    it('classifies a new id as created', () => {
      expect(classify('rooms', validBackupRow('rooms'))).toEqual({ status: 'created', reason: null });
    });

    it('classifies an existing id as updated', () => {
      const row = validBackupRow('rooms');
      expect(classify('rooms', row, [row])).toEqual({ status: 'updated', reason: null });
    });

    it('rejects an id with the wrong prefix', () => {
      const row = validBackupRow('rooms', { id: validId('stu') });
      expect(classify('rooms', row).status).toBe('invalid');
      expect(classify('rooms', row).reason).toContain('invalid-id');
    });

    it('rejects an id-carrying row with an incomplete envelope', () => {
      const row = validBackupRow('rooms', {}, ['createdAt', 'updatedBy']);
      expect(classify('rooms', row)).toEqual({ status: 'invalid', reason: 'incomplete-envelope' });
    });

    it('rejects an id-carrying row missing the tombstone column (deletedAt)', () => {
      const row = validBackupRow('rooms', {}, ['deletedAt']);
      expect(classify('rooms', row)).toEqual({ status: 'invalid', reason: 'incomplete-envelope' });
    });
  });

  describe('restore-conflict skip sheets', () => {
    it('classifies an existing id on the payments sheet as a duplicate, never updated', () => {
      const row = validBackupRow('payments');
      expect(classify('payments', row, [row])).toEqual({
        status: 'duplicate',
        reason: 'already-exists',
      });
    });

    it('classifies a new id on the payments sheet as created', () => {
      const row = validBackupRow('payments', { id: 'pay_01HWAAAAAAAAAAAAAAAAAAAAAB' });
      expect(classify('payments', row)).toEqual({ status: 'created', reason: null });
    });
  });

  describe('id-less rows', () => {
    const idLess = validBackupRow('parents', { id: undefined }, ['id', 'createdAt', 'updatedAt', 'updatedBy', 'deviceOrigin', 'version']);

    it('creates an id-less people-like row with a fresh envelope', () => {
      expect(classify('parents', idLess)).toEqual({ status: 'created', reason: null });
    });

    it('flags an id-less people-like row whose naturalKey already exists as a duplicate', () => {
      const existing = validBackupRow('parents', {
        id: validId('prt'),
        naturalKey: `${CENTER}::dupe::x`,
      });
      const row = { ...idLess, naturalKey: `${CENTER}::dupe::x` };
      expect(classify('parents', row, [existing])).toEqual({
        status: 'duplicate',
        reason: 'natural-key-exists',
      });
    });

    it('requires a naturalKey on id-less people-like rows', () => {
      const row = { ...idLess, naturalKey: undefined };
      expect(classify('parents', row)).toEqual({ status: 'invalid', reason: 'natural-key-required' });
    });

    it('rejects an id-less row on a non-people sheet', () => {
      const row = validBackupRow('rooms', { id: undefined }, ['id', 'createdAt', 'updatedAt', 'updatedBy', 'deviceOrigin', 'version']);
      expect(classify('rooms', row)).toEqual({ status: 'invalid', reason: 'id-required' });
    });
  });

  describe('validation', () => {
    it('rejects a row for another center', () => {
      const row = validBackupRow('rooms', { centerCode: 'CS-RABAT-002' });
      expect(classify('rooms', row)).toEqual({ status: 'invalid', reason: 'wrong-center' });
    });

    it('rejects a missing required field', () => {
      const row = validBackupRow('rooms', {}, ['capacity']);
      expect(classify('rooms', row).reason).toContain('missing-field:capacity');
    });

    it('rejects a wrong-typed value', () => {
      const row = validBackupRow('rooms', { capacity: 'twenty' });
      expect(classify('rooms', row).reason).toContain('bad-type:capacity');
    });

    it('tolerates extra unknown columns (forward-compatible)', () => {
      const row = validBackupRow('rooms', { futureColumn: 'hello' });
      expect(classify('rooms', row).status).toBe('created');
    });

    it('tolerates a weekly-recurring-session row missing conflictAccepted (pre-SOU-183 backup restores as false)', () => {
      const spec = findBackupSheet('weekly-recurring-sessions')!;
      const row = validBackupRow('weekly-recurring-sessions', {}, ['conflictAccepted']);
      expect(validateBackupRow(spec, row)).toEqual([]);
    });

    it('tolerates null on optional envelope columns', () => {
      const row = validBackupRow('parents', { id: undefined, createdAt: null, deletedAt: null }, ['id', 'deviceOrigin', 'updatedAt', 'updatedBy', 'version']);
      expect(validateBackupRow(findBackupSheet('parents')!, row)).toEqual([]);
    });
  });
});
