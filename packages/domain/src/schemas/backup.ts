import { z } from 'zod';

/**
 * Backup destination/retention input schemas (SOU-102). Messages are stable
 * **error codes**, not user-facing strings — the renderer resolves each via
 * `t(\`errors.${code}\`)`, same convention as the center profile schemas.
 */

export const BACKUP_DESTINATION_DIR_MAX = 1024;
export const BACKUP_RETENTION_MIN = 1;
export const BACKUP_RETENTION_MAX = 30;

const backupDestinationDirSchema = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(BACKUP_DESTINATION_DIR_MAX, { message: 'too-long' });

const backupRetentionCountSchema = z
  .number()
  .int()
  .min(BACKUP_RETENTION_MIN, { message: 'too-low' })
  .max(BACKUP_RETENTION_MAX, { message: 'too-high' });

export const createBackupInputSchema = z.object({
  destDir: backupDestinationDirSchema,
});
export type CreateBackupInputSchema = z.infer<typeof createBackupInputSchema>;

export const backupConfigInputSchema = z.object({
  destinationDir: backupDestinationDirSchema,
  retentionCount: backupRetentionCountSchema,
});
export type BackupConfigInput = z.infer<typeof backupConfigInputSchema>;
