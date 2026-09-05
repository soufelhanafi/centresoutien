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
  'already-exists',
  'invalid-windows',
  'invalid-weekly-windows',
]);

type ReasonView = { key: string; params?: Record<string, string> };

/** Map one stable classification token to an i18n key. Tokens may carry a field
 *  suffix (`missing-field:capacity`); unknown tokens fall back to a generic
 *  "unknown reason" label, never raw token soup. */
function reasonLookup(token: string, field: string): ReasonView {
  if (token === 'missing-field' || token === 'bad-type') {
    const mapped: ReasonView = { key: `${REASON_KEY_PREFIX}.${token}` };
    if (field) mapped.params = { field };
    return mapped;
  }
  if (SIMPLE_REASON_TOKENS.has(token)) return { key: `${REASON_KEY_PREFIX}.${token}` };
  return { key: `${REASON_KEY_PREFIX}.unknown` };
}

/**
 * `classifyImportRow` can bundle several structural failures on one row into a
 * single `;`-joined reason (`missing-field:phone;bad-type:capacity`) — split on
 * `;` first so each failure is looked up and translated on its own. Feeding the
 * whole joined string through a single `token:field` split swallowed every
 * failure after the first into the `{{field}}` slot of the first, rendering
 * garbled text like "Champ manquant : phone;bad-type:capacity" instead of a
 * real explanation.
 */
function reasonSegments(reason: string): ReasonView[] {
  return reason.split(';').map((segment) => {
    const separator = segment.indexOf(':');
    const token = separator === -1 ? segment : segment.slice(0, separator);
    const field = separator === -1 ? '' : segment.slice(separator + 1).trim();
    return reasonLookup(token, field);
  });
}

/** One workbook row's verdict: sheet, Excel row number, status badge, reason. */
export function ExcelBackupPreviewRow({ row }: { row: BackupImportRowReport }) {
  const { t } = useTranslation();
  const reasonText = row.reason
    ? reasonSegments(row.reason)
        .map((segment) => (segment.params ? t(segment.key, segment.params) : t(segment.key)))
        .join(', ')
    : null;

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
        {reasonText ?? <span className="text-muted-foreground">—</span>}
      </DataTableCell>
    </DataTableRow>
  );
}
