import { DomainError } from './plan-errors';

/**
 * Thrown when the backup workbook file cannot be read: missing, unreadable, or
 * not a workbook. The renderer maps the stable `backup-file-read` code to a
 * localized message — a bad file is a user error, not an internal failure.
 */
export class BackupFileReadError extends DomainError {
  readonly code = 'backup-file-read';

  constructor(readonly path: string, detail: string) {
    super(`Cannot read backup workbook "${path}": ${detail}`);
  }
}

/**
 * Thrown when writing a backup workbook fails (unwritable folder, full disk…).
 * The renderer maps the stable `backup-file-write` code to a localized message.
 */
export class BackupFileWriteError extends DomainError {
  readonly code = 'backup-file-write';

  constructor(readonly path: string, detail: string) {
    super(`Cannot write backup workbook "${path}": ${detail}`);
  }
}

/**
 * Thrown when an applied import fails partway through its single transaction.
 * The whole import is rolled back — nothing was written — and the renderer
 * surfaces the stable `backup-apply` code with the failing sheet/row.
 */
export class BackupImportApplyError extends DomainError {
  readonly code = 'backup-apply';

  constructor(
    readonly sheetName: string,
    readonly rowNumber: number,
    detail: string,
  ) {
    super(`Backup import failed at ${sheetName} row ${rowNumber}: ${detail}`);
  }
}
