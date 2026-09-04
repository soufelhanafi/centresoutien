import ExcelJS from 'exceljs';
import type {
  BackupCellValue,
  BackupExcelPort,
  BackupRow,
  BackupSheet,
  BackupWorkbook,
} from '@centresoutien/domain';

type ExceljsCellObject = {
  text?: unknown;
  richText?: unknown;
  formula?: unknown;
  sharedFormula?: unknown;
  result?: unknown;
  error?: unknown;
};

/**
 * Normalize any exceljs cell value to the portable {@link BackupCellValue}.
 *
 * A formula cell (`=TODAY()`, a drag-filled `=A2`, a checkbox-style `=TRUE()`)
 * round-trips through exceljs as `{ formula, result }` rather than the plain
 * value — someone filling in the exported template by hand routinely leaves
 * such formulas behind, so the cached `result` is unwrapped the same way a
 * plain cell would be, instead of falling through to `String(value)` and
 * producing the literal text `"[object Object]"` (which then fails every
 * column-type check downstream). A bare formula/computation error (`#DIV/0!`,
 * `#REF!`, …) has no usable value and becomes `null`, which the row validator
 * already treats as a normal missing/invalid cell.
 */
function toCellValue(value: unknown): BackupCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    const candidate = value as ExceljsCellObject;
    if (typeof candidate.error === 'string') return null;
    if (typeof candidate.text === 'string') return candidate.text;
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => part.text).join('');
    }
    if ('formula' in candidate || 'sharedFormula' in candidate) {
      return toCellValue(candidate.result);
    }
  }
  return String(value);
}

/**
 * exceljs adapter for {@link BackupExcelPort} (SOU-44). Pure file translation:
 * workbook ↔ xlsx, using the domain column names as headers. No business logic —
 * the domain decides what the sheets mean. Values are written as their primitive
 * form (numbers stay numbers, booleans stay booleans, `null` is an empty cell),
 * so the file round-trips without the adapter guessing types.
 */
export class ExcelBackupAdapter implements BackupExcelPort {
  async readWorkbook(path: string): Promise<BackupWorkbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);

    const sheets: BackupSheet[] = [];
    workbook.eachSheet((worksheet) => {
      const columns: string[] = [];
      const rows: BackupRow[] = [];
      let readingHeader = true;

      worksheet.eachRow((row) => {
        const values = row.values as unknown[];
        if (readingHeader) {
          for (let index = 1; index < values.length; index += 1) {
            const cell = toCellValue(values[index]);
            columns.push(cell === null ? `column${index}` : String(cell));
          }
          readingHeader = false;
          return;
        }

        const record: BackupRow = {};
        let hasContent = false;
        for (let index = 1; index <= columns.length; index += 1) {
          const column = columns[index - 1];
          if (column === undefined) continue;
          const cell = toCellValue(values[index]);
          if (cell !== null && cell !== undefined) {
            hasContent = true;
            record[column] = cell;
          } else {
            // A missing trailing cell is an explicit null — optional columns
            // round-trip as `null`, never as an absent key.
            record[column] = null;
          }
        }
        if (hasContent) rows.push(record);
      });

      if (columns.length > 0) {
        sheets.push({ name: worksheet.name, columns, rows });
      }
    });

    return { sheets };
  }

  async writeWorkbook(path: string, workbook: BackupWorkbook): Promise<void> {
    const output = new ExcelJS.Workbook();
    for (const sheet of workbook.sheets) {
      const worksheet = output.addWorksheet(sheet.name);
      worksheet.addRow(sheet.columns);
      for (const row of sheet.rows) {
        worksheet.addRow(sheet.columns.map((column) => row[column] ?? null));
      }
    }
    await output.xlsx.writeFile(path);
  }
}
