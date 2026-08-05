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

// Excel backup workbook (SOU-44) — data-level export/import, distinct from the
// byte-level snapshot/restore channels above. Dates already cross as ISO strings
// (the workbook format), so no envelope projection is needed here.
const backupImportCountsSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
});

const backupImportRowViewSchema = z.object({
  sheetName: z.string(),
  rowNumber: z.number().int().positive(),
  status: z.enum(['created', 'updated', 'duplicate', 'invalid']),
  reason: z.string().nullable(),
});

const backupImportPreviewViewSchema = z.object({
  sheets: z.array(z.string()),
  unknownSheets: z.array(z.string()),
  counts: backupImportCountsSchema,
  rows: z.array(backupImportRowViewSchema),
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
  // Excel backup engine (SOU-44). `pathToken` is a one-time handle main issued
  // from a native save/open dialog (dialog.selectFile / selectSaveFile) — the
  // renderer never sends a raw filesystem path, and main revalidates the token
  // + `.xlsx` suffix on every call (SOU-44 M3). `centerCode` and the device
  // context are injected in main.
  'backup.excel.export': {
    request: z.object({ pathToken: z.string().trim().min(1) }),
    response: z.object({
      filePath: z.string(),
      counts: z.record(z.string(), z.number().int().nonnegative()),
    }),
  },
  'backup.excel.preview': {
    request: z.object({ pathToken: z.string().trim().min(1) }),
    response: z.object({ preview: backupImportPreviewViewSchema }),
  },
  'backup.excel.apply': {
    request: z.object({ pathToken: z.string().trim().min(1) }),
    response: z.object({
      counts: backupImportCountsSchema,
      totalRows: z.number().int().nonnegative(),
    }),
  },
} as const;

export type BackupFileDto = z.infer<typeof backupFileViewSchema>;
export type BackupConfigDto = z.infer<typeof backupConfigViewSchema>;
export type BackupImportPreviewDto = z.infer<typeof backupImportPreviewViewSchema>;
