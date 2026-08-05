import ExcelJS from 'exceljs';
import type {
  BackupCellValue,
  BackupExcelPort,
  BackupRow,
  BackupSheet,
  BackupWorkbook,
} from '@centresoutien/domain';

/** Normalize any exceljs cell value to the portable {@link BackupCellValue}. */
function toCellValue(value: unknown): BackupCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    const candidate = value as { text?: unknown; richText?: unknown };
    if (typeof candidate.text === 'string') return candidate.text;
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => part.text).join('');
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
