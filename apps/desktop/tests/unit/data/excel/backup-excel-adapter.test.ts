import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExcelBackupAdapter } from '../../../../src/data/excel/backup-excel-adapter';

/**
 * A user filling in the exported template by hand routinely leaves Excel
 * formulas behind — a drag-filled `=A2`, a `=TODAY()` date, a checkbox-style
 * `=TRUE()` — rather than a plain value. This adapter is the only place that
 * translates raw exceljs cells into the domain's {@link BackupCellValue}, so
 * it alone is responsible for unwrapping those cells instead of letting them
 * reach row validation as the stringified `"[object Object]"`.
 */
describe('ExcelBackupAdapter.readWorkbook', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cs-backup-excel-adapter-'));
    path = join(dir, 'workbook.xlsx');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function readSingleRow(buildRow: (row: ExcelJS.Row) => void) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('parents');
    worksheet.addRow(['id', 'value']);
    buildRow(worksheet.addRow(['prt_1', null]));
    await workbook.xlsx.writeFile(path);

    const result = await new ExcelBackupAdapter().readWorkbook(path);
    return result.sheets[0]?.rows[0];
  }

  it('unwraps a formula cell to its cached result', async () => {
    const row = await readSingleRow((r) => {
      r.getCell(2).value = { formula: 'TRUE()', result: true };
    });
    expect(row?.['value']).toBe(true);
  });

  it('unwraps a shared-formula cell to its cached result', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('parents');
    worksheet.addRow(['id', 'value']);
    worksheet.addRow(['prt_1', null]).getCell(2).value = { formula: 'A2*2', result: 2, shareType: 'shared', ref: 'B2:B3' };
    worksheet.addRow(['prt_2', null]).getCell(2).value = { sharedFormula: 'B2', result: 4 };
    await workbook.xlsx.writeFile(path);

    const result = await new ExcelBackupAdapter().readWorkbook(path);
    expect(result.sheets[0]?.rows[1]?.['value']).toBe(4);
  });

  it('unwraps a formula cell whose cached result is a date', async () => {
    const resultDate = new Date('2026-01-15T00:00:00.000Z');
    const row = await readSingleRow((r) => {
      r.getCell(2).value = { formula: 'TODAY()', result: resultDate };
    });
    expect(row?.['value']).toBe(resultDate.toISOString());
  });

  it('turns a formula computation error into null, not a stringified object', async () => {
    const row = await readSingleRow((r) => {
      r.getCell(2).value = { formula: '1/0', result: { error: '#DIV/0!' } };
    });
    expect(row?.['value']).toBeNull();
  });

  it('turns a bare cell error into null, not a stringified object', async () => {
    const row = await readSingleRow((r) => {
      r.getCell(2).value = { error: '#REF!' };
    });
    expect(row?.['value']).toBeNull();
  });

  it('still reads a hyperlink cell by its display text', async () => {
    const row = await readSingleRow((r) => {
      r.getCell(2).value = { text: 'Contact', hyperlink: 'mailto:a@b.com' };
    });
    expect(row?.['value']).toBe('Contact');
  });

  it('still joins a rich-text cell into plain text', async () => {
    const row = await readSingleRow((r) => {
      r.getCell(2).value = { richText: [{ text: 'foo' }, { text: 'bar' }] };
    });
    expect(row?.['value']).toBe('foobar');
  });
});
