import { useTranslation } from 'react-i18next';
import { Badge, DataTableCell, DataTableRow, Numeric } from '@centresoutien/ui';
import type { BackupImportRowReport, ImportRowStatus } from '@centresoutien/domain';

const STATUS_KEY: Record<ImportRowStatus, string> = {
  created: 'settings.backup.excel.statusCreated',
  updated: 'settings.backup.excel.statusUpdated',
  duplicate: 'settings.backup.excel.statusDuplicate',
  invalid: 'settings.backup.excel.statusInvalid',
};

const STATUS_TONE: Record<ImportRowStatus, 'success' | 'info' | 'warning' | 'destructive'> = {
  created: 'success',
  updated: 'info',
  duplicate: 'warning',
  invalid: 'destructive',
};

/** One workbook row's verdict: sheet, Excel row number, status badge, reason. */
export function ExcelBackupPreviewRow({ row }: { row: BackupImportRowReport }) {
  const { t } = useTranslation();

  return (
    <DataTableRow>
      <DataTableCell>
        <span dir="ltr" className="font-mono text-xs font-medium text-foreground">
          {row.sheetName}
        </span>
      </DataTableCell>
      <DataTableCell>
        <Numeric>{row.rowNumber}</Numeric>
      </DataTableCell>
      <DataTableCell>
        <Badge variant={STATUS_TONE[row.status]} dot>
          {t(STATUS_KEY[row.status])}
        </Badge>
      </DataTableCell>
      <DataTableCell className="break-words">
        {row.reason ?? <span className="text-muted-foreground">—</span>}
      </DataTableCell>
    </DataTableRow>
  );
}
