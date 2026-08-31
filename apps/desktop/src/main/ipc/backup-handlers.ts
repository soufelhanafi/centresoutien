import type {
  CreateBackup,
  GetBackupConfig,
  SaveBackupConfig,
  RestoreBackup,
  BackupConfig,
  BackupFileInfo,
  CenterCode,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { SessionPrincipal } from '../session/session-principal';
import { requirePermission } from './require-permission';

export type CreateBackupUseCase = Pick<CreateBackup, 'execute'>;
export type GetBackupConfigUseCase = Pick<GetBackupConfig, 'execute'>;
export type SaveBackupConfigUseCase = Pick<SaveBackupConfig, 'execute'>;
export type RestoreBackupUseCase = Pick<RestoreBackup, 'execute'>;

/** Only the surface the backup channels need — a stub satisfies it in tests. */
export type BackupHandlerDeps = {
  createBackup: CreateBackupUseCase;
  getBackupConfig: GetBackupConfigUseCase;
  saveBackupConfig: SaveBackupConfigUseCase;
  restoreBackup: RestoreBackupUseCase;
  activeCenterCode: () => CenterCode;
  /** The per-center derived SQLCipher key (SOU-179) — same key that opened the
   *  live DB, so backups verify/restore only on the machine that made them. */
  dbKey: () => string;
  /** Called once a restore has swapped the live DB file — schedules an app
   *  relaunch so the next `buildContainer` opens the restored file. */
  scheduleRestart: () => void;
  // Assistant-visibility (`settings.sensitive`): every channel here backs the
  // Backup settings tab exclusively — backup/restore is the most consequential
  // of the sensitive-settings actions (restore replaces the live DB file).
  resolvePrincipal: () => Promise<SessionPrincipal | null>;
};

/** Project a backup file to its boundary DTO: `Date` serialized, like every
 *  other view in `handlers.ts`. */
function toBackupFileView(file: BackupFileInfo) {
  return {
    fileName: file.fileName,
    path: file.path,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
  };
}

/** Project the backup config to its boundary DTO: `Date | null` serialized. */
function toBackupConfigView(config: BackupConfig) {
  return {
    destinationDir: config.destinationDir,
    retentionCount: config.retentionCount,
    lastBackupAt: config.lastBackupAt ? config.lastBackupAt.toISOString() : null,
  };
}

/**
 * Backup & restore IPC handlers (SOU-102), split out of `handlers.ts` to keep
 * that file from growing further — spread into `createHandlers`'s return
 * object. Each handler delegates to a pre-wired domain use case; it adds no
 * business logic.
 */
export function createBackupHandlers(
  deps: BackupHandlerDeps,
): Pick<IpcHandlers, 'backup.create' | 'backup.restore' | 'backup.config.get' | 'backup.config.set'> {
  return {
    'backup.create': async (request) => {
      await requirePermission(deps.resolvePrincipal, 'settings.sensitive');
      const file = await deps.createBackup.execute({
        destDir: request.destDir,
        centerCode: deps.activeCenterCode(),
      });
      return { file: toBackupFileView(file) };
    },
    'backup.restore': async (request) => {
      await requirePermission(deps.resolvePrincipal, 'settings.sensitive');
      const result = await deps.restoreBackup.execute({ path: request.path, key: deps.dbKey() });
      if (result.outcome === 'restored') deps.scheduleRestart();
      return { outcome: result.outcome };
    },
    'backup.config.get': async () => {
      await requirePermission(deps.resolvePrincipal, 'settings.sensitive');
      return { config: toBackupConfigView(await deps.getBackupConfig.execute()) };
    },
    'backup.config.set': async (request) => {
      await requirePermission(deps.resolvePrincipal, 'settings.sensitive');
      return { config: toBackupConfigView(await deps.saveBackupConfig.execute(request)) };
    },
  };
}
