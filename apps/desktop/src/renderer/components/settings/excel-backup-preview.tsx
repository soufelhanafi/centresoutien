import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  Button,
  DataTable,
  DataTableHead,
  DataTableRow,
  Numeric,
  ScrollArea,
  cn,
  toast,
} from '@centresoutien/ui';
import type { BackupImportPreviewDto } from '../../../shared/ipc/backup-contract';
import { BACKUP_SHEET_NAMES, type ImportRowStatus } from '@centresoutien/domain';
import { useExcelBackupApply } from '../../hooks/settings/use-excel-backup-apply';
import { ExcelBackupApplyDialog } from './excel-backup-apply-dialog';
import { ExcelBackupPreviewRow } from './excel-backup-preview-row';

const COUNT_DOT: Record<'success' | 'info' | 'warning' | 'destructive', string> = {
  success: 'bg-[var(--badge-success-dot)]',
  info: 'bg-[var(--badge-info-dot)]',
  warning: 'bg-[var(--badge-warning-dot)]',
  destructive: 'bg-[var(--badge-destructive-dot)]',
};

const ROW_COLUMNS = ['1.3fr', '84px', '120px', '1.6fr'] as const;

/**
 * A count card doubles as a status filter for the row table below: clicking it
 * shows only that status's rows, clicking the already-active one clears the
 * filter back to "all rows".
 */
function CountChip({
  label,
  value,
  tone,
  selected,
  onClick,
}: {
  label: string;
  value: number;
  tone: keyof typeof COUNT_DOT;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-start transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', COUNT_DOT[tone])} aria-hidden="true" />
        {label}
      </span>
      <Numeric className="text-sm font-semibold text-foreground">{value}</Numeric>
    </button>
  );
}

type ExcelBackupPreviewProps = {
  preview: BackupImportPreviewDto;
  /** The dialog-issued token for the picked workbook — apply reuses it. */
  pathToken: string;
  onRepick: () => void;
};

/**
 * Dry-run report of a picked Excel backup file (SOU-44): aggregate counts,
 * unknown-sheet notice, and one row per workbook row. Apply is only offered
 * when at least one row is actionable (created/updated); duplicates and
 * invalid rows are surfaced but skipped on commit.
 */
export function ExcelBackupPreview({ preview, pathToken, onRepick }: ExcelBackupPreviewProps) {
  const { t } = useTranslation();
  const apply = useExcelBackupApply();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ImportRowStatus | null>(null);

  const applicable = preview.counts.created + preview.counts.updated;
  const skipped = preview.counts.duplicate + preview.counts.invalid;

  const toggleStatusFilter = (status: ImportRowStatus) => {
    setStatusFilter((current) => (current === status ? null : status));
  };

  const filteredRows = useMemo(
    () => (statusFilter === null ? preview.rows : preview.rows.filter((row) => row.status === statusFilter)),
    [preview.rows, statusFilter],
  );

  const onConfirm = async () => {
    setConfirmOpen(false);
    try {
      await apply.mutateAsync({ pathToken });
    } catch {
      toast.error(t('settings.backup.excel.importError'));
    }
  };

  if (apply.isSuccess && apply.data) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            {t('settings.backup.excel.applySuccess', {
              count: apply.data.counts.created,
              created: apply.data.counts.created,
              updated: apply.data.counts.updated,
            })}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRepick}>
          {t('settings.backup.excel.importPickAnother')}
        </Button>
      </div>
    );
  }

  // Sheets this app knows but the picked file does not carry — the "full
  // backup" promise only covers the sheets present, so make the gap visible
  // instead of letting a restore happen silently.
  const missingSheets = BACKUP_SHEET_NAMES.filter((name) => !preview.sheets.includes(name));

  return (
    <div className="flex w-full flex-col gap-4">
      <div role="group" aria-label={t('settings.backup.excel.filterGroupLabel')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountChip
          label={t('settings.backup.excel.countCreated')}
          value={preview.counts.created}
          tone="success"
          selected={statusFilter === 'created'}
          onClick={() => toggleStatusFilter('created')}
        />
        <CountChip
          label={t('settings.backup.excel.countUpdated')}
          value={preview.counts.updated}
          tone="info"
          selected={statusFilter === 'updated'}
          onClick={() => toggleStatusFilter('updated')}
        />
        <CountChip
          label={t('settings.backup.excel.countDuplicate')}
          value={preview.counts.duplicate}
          tone="warning"
          selected={statusFilter === 'duplicate'}
          onClick={() => toggleStatusFilter('duplicate')}
        />
        <CountChip
          label={t('settings.backup.excel.countInvalid')}
          value={preview.counts.invalid}
          tone="destructive"
          selected={statusFilter === 'invalid'}
          onClick={() => toggleStatusFilter('invalid')}
        />
      </div>

      {statusFilter !== null && (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setStatusFilter(null)}>
          {t('settings.backup.excel.filterClear')}
        </Button>
      )}

      {preview.unknownSheets.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('settings.backup.excel.unknownSheetsTitle')}
          </p>
          <p className="text-sm text-foreground">
            {t('settings.backup.excel.unknownSheetsBody', { sheets: preview.unknownSheets.join(', ') })}
          </p>
        </div>
      )}

      {missingSheets.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('settings.backup.excel.missingSheetsTitle')}
          </p>
          <p className="text-sm text-foreground">
            {t('settings.backup.excel.missingSheetsBody', { sheets: missingSheets.join(', ') })}
          </p>
        </div>
      )}

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.backup.excel.filterEmpty')}</p>
      ) : (
        <ScrollArea className="max-h-80 rounded-xl border border-border bg-card" options={{ overflow: { x: 'scroll', y: 'scroll' } }}>
          <DataTable columns={ROW_COLUMNS}>
            <thead>
              <DataTableRow>
                <DataTableHead>{t('settings.backup.excel.colSheet')}</DataTableHead>
                <DataTableHead>{t('settings.backup.excel.colRow')}</DataTableHead>
                <DataTableHead>{t('settings.backup.excel.colStatus')}</DataTableHead>
                <DataTableHead>{t('settings.backup.excel.colReason')}</DataTableHead>
              </DataTableRow>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <ExcelBackupPreviewRow key={`${row.sheetName}-${row.rowNumber}`} row={row} />
              ))}
            </tbody>
          </DataTable>
        </ScrollArea>
      )}

      {applicable === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.backup.excel.noApplicable')}</p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          {skipped > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('settings.backup.excel.skippedNotice', {
                count: preview.counts.duplicate,
                duplicates: preview.counts.duplicate,
                invalid: preview.counts.invalid,
              })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t('settings.backup.excel.skipConflictNote')}</p>
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={apply.isPending}>
            {apply.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t('settings.backup.excel.applyPending')}
              </>
            ) : (
              t('settings.backup.excel.applyButton', { count: applicable })
            )}
          </Button>
        </div>
      )}

      <ExcelBackupApplyDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={apply.isPending}
        onConfirm={onConfirm}
      />
    </div>
  );
}
