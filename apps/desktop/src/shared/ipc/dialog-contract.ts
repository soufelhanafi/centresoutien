import { z } from 'zod';

/**
 * Native OS folder/file picker channels (SOU-102), split out like
 * `backup-contract.ts` — spread into `ipcContract`. No backup-specific logic
 * here: the Backup tab is the first consumer (destination folder for manual
 * backups, source file for restore), but the channel is generic so any future
 * screen needing a native picker reuses it instead of an `<input type="file">`
 * hack. A `null` path means the user cancelled — never an error.
 */
export const dialogIpcContract = {
  'dialog.selectFolder': {
    request: z.object({}),
    response: z.object({ path: z.string().nullable() }),
  },
  'dialog.selectFile': {
    request: z.object({ extensions: z.array(z.string()).optional() }),
    response: z.object({ path: z.string().nullable() }),
  },
} as const;
