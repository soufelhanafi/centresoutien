import { z } from 'zod';
import { createBackupInputSchema, backupConfigInputSchema } from '@centresoutien/domain';

// The presentation projections of a backup file / the backup config across the
// IPC boundary — Dates serialized to strings, exactly like every other view
// schema in `contract.ts`. Single source of truth for the renderer's
// `BackupFileView` / `BackupConfigView` types.
const backupFileViewSchema = z.object({
  fileName: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});

const backupConfigViewSchema = z.object({
  destinationDir: z.string().nullable(),
  retentionCount: z.number().int(),
  lastBackupAt: z.string().nullable(),
});

/**
 * Backup & restore channels (SOU-102), split into their own file to keep
 * `contract.ts` from growing further — spread into `ipcContract`.
 *
 * `create`/`config.set` reuse the domain's own input schemas, like every other
 * write channel. `restore` returns a discriminated outcome (mirrors
 * `auth.login`) instead of throwing on a bad file, so "corrupted"/"wrong-key"
 * are ordinary responses the renderer shows with a clear FR/AR message — never
 * an error toast. `centerCode`/the SQLCipher key are injected in main, never
 * sent from the renderer.
 */
export const backupIpcContract = {
  'backup.create': {
    request: createBackupInputSchema,
    response: z.object({ file: backupFileViewSchema }),
  },
  'backup.restore': {
    request: z.object({ path: z.string().trim().min(1) }),
    response: z.object({
      outcome: z.enum(['restored', 'not-found', 'corrupted', 'wrong-key']),
    }),
  },
  'backup.config.get': {
    request: z.object({}),
    response: z.object({ config: backupConfigViewSchema }),
  },
  'backup.config.set': {
    request: backupConfigInputSchema,
    response: z.object({ config: backupConfigViewSchema }),
  },
} as const;

export type BackupFileDto = z.infer<typeof backupFileViewSchema>;
export type BackupConfigDto = z.infer<typeof backupConfigViewSchema>;
