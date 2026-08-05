import type {
  ApplyImportBackup,
  BackupImportPreview,
  ExportBackup,
  PreviewImportBackup,
  CenterCode,
} from '@centresoutien/domain';
import type { BackupImportPreviewDto } from '../../shared/ipc/backup-contract';
import type { IpcHandlers } from '../../shared/ipc/contract';

export type ExportBackupUseCase = Pick<ExportBackup, 'execute'>;
export type PreviewImportBackupUseCase = Pick<PreviewImportBackup, 'execute'>;
export type ApplyImportBackupUseCase = Pick<ApplyImportBackup, 'execute'>;

/** Only the surface the Excel backup channels need — a stub satisfies it in tests. */
export type BackupExcelHandlerDeps = {
  exportBackup: ExportBackupUseCase;
  previewImportBackup: PreviewImportBackupUseCase;
  applyImportBackup: ApplyImportBackupUseCase;
  activeCenterCode: () => CenterCode;
};

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
 * business logic. `centerCode` is injected (the active center), never sent by
 * the renderer.
 */
export function createBackupExcelHandlers(
  deps: BackupExcelHandlerDeps,
): Pick<IpcHandlers, 'backup.excel.export' | 'backup.excel.preview' | 'backup.excel.apply'> {
  return {
    'backup.excel.export': async (request) => {
      const result = await deps.exportBackup.execute({ filePath: request.filePath });
      return { filePath: result.filePath, counts: result.counts };
    },
    'backup.excel.preview': async (request) => {
      const preview = await deps.previewImportBackup.execute({
        filePath: request.filePath,
        centerCode: deps.activeCenterCode(),
      });
      return { preview: toPreviewView(preview) };
    },
    'backup.excel.apply': async (request) => {
      const result = await deps.applyImportBackup.execute({
        filePath: request.filePath,
        centerCode: deps.activeCenterCode(),
      });
      return { counts: result.counts, totalRows: result.totalRows };
    },
  };
}
