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

const REASON_KEY_PREFIX = 'settings.backup.excel.reason';

const SIMPLE_REASON_TOKENS = new Set([
  'not-a-row',
  'wrong-center',
  'invalid-id',
  'incomplete-envelope',
  'natural-key-required',
  'id-required',
  'natural-key-exists',
]);

/** Map a stable classification token to an i18n key. Tokens may carry a field
 *  suffix (`missing-field:capacity`); unknown tokens fall back to raw display. */
function reasonLookup(reason: string): { key: string; params?: Record<string, string> } | null {
  const separator = reason.indexOf(':');
  const token = separator === -1 ? reason : reason.slice(0, separator);
  const field = separator === -1 ? '' : reason.slice(separator + 1).trim();

  if (token === 'missing-field' || token === 'bad-type') {
    const mapped: { key: string; params?: Record<string, string> } = {
      key: `${REASON_KEY_PREFIX}.${token}`,
    };
    if (field) mapped.params = { field };
    return mapped;
  }
  if (SIMPLE_REASON_TOKENS.has(token)) return { key: `${REASON_KEY_PREFIX}.${token}` };
  return null;
}

/** One workbook row's verdict: sheet, Excel row number, status badge, reason. */
export function ExcelBackupPreviewRow({ row }: { row: BackupImportRowReport }) {
  const { t } = useTranslation();
  const reason = row.reason ? reasonLookup(row.reason) : null;

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
        {reason ? (reason.params ? t(reason.key, reason.params) : t(reason.key)) : row.reason ?? <span className="text-muted-foreground">—</span>}
      </DataTableCell>
    </DataTableRow>
  );
}
