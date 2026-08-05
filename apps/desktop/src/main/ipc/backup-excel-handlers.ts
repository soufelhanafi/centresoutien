import type {
  ApplyImportBackup,
  BackupImportPreview,
  ExportBackup,
  PreviewImportBackup,
  CenterCode,
} from '@centresoutien/domain';
import type { BackupImportPreviewDto } from '../../shared/ipc/backup-contract';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { DialogPathRegistry } from './dialog-path-registry';

export type ExportBackupUseCase = Pick<ExportBackup, 'execute'>;
export type PreviewImportBackupUseCase = Pick<PreviewImportBackup, 'execute'>;
export type ApplyImportBackupUseCase = Pick<ApplyImportBackup, 'execute'>;

/** Only the surface the Excel backup channels need — a stub satisfies it in tests. */
export type BackupExcelHandlerDeps = {
  exportBackup: ExportBackupUseCase;
  previewImportBackup: PreviewImportBackupUseCase;
  applyImportBackup: ApplyImportBackupUseCase;
  activeCenterCode: () => CenterCode;
  /** Resolves dialog-issued path tokens so no channel trusts a renderer path. */
  dialogPaths: DialogPathRegistry;
};

const XLSX_SUFFIX = '.xlsx';

/**
 * The path a backup channel is allowed to touch: the dialog-issued token's path,
 * normalized to a `.xlsx` suffix. A token that is unknown or expired, or a path
 * that isn't a workbook, is rejected — the renderer can only reach files the
 * user picked in a native dialog (SOU-44 M3).
 */
function resolveBackupPath(dialogPaths: DialogPathRegistry, token: string): string {
  const path = dialogPaths.resolve(token);
  if (path === null) {
    throw new Error('Excel backup: path token is unknown or expired — re-pick the file');
  }
  return path.toLowerCase().endsWith(XLSX_SUFFIX) ? path : `${path}${XLSX_SUFFIX}`;
}

/** Project the domain preview to its boundary DTO (readonly arrays → plain). */
function toPreviewView(preview: BackupImportPreview): BackupImportPreviewDto {
  return {
    sheets: [...preview.sheets],
    unknownSheets: [...preview.unknownSheets],
    counts: { ...preview.counts },
    rows: preview.rows.map((row) => ({ ...row })),
  };
}

/**
 * Excel backup engine IPC handlers (SOU-44), split out like the SOU-102 backup
 * handlers. Each handler delegates to a pre-wired domain use case; it adds no
 * business logic beyond resolving the dialog path token. `centerCode` is
 * injected (the active center), never sent by the renderer.
 */
export function createBackupExcelHandlers(
  deps: BackupExcelHandlerDeps,
): Pick<IpcHandlers, 'backup.excel.export' | 'backup.excel.preview' | 'backup.excel.apply'> {
  return {
    'backup.excel.export': async (request) => {
      const result = await deps.exportBackup.execute({
        filePath: resolveBackupPath(deps.dialogPaths, request.pathToken),
      });
      return { filePath: result.filePath, counts: result.counts };
    },
    'backup.excel.preview': async (request) => {
      const preview = await deps.previewImportBackup.execute({
        filePath: resolveBackupPath(deps.dialogPaths, request.pathToken),
        centerCode: deps.activeCenterCode(),
      });
      return { preview: toPreviewView(preview) };
    },
    'backup.excel.apply': async (request) => {
      const result = await deps.applyImportBackup.execute({
        filePath: resolveBackupPath(deps.dialogPaths, request.pathToken),
        centerCode: deps.activeCenterCode(),
      });
      return { counts: result.counts, totalRows: result.totalRows };
    },
  };
}
