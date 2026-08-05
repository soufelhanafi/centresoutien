import { useTranslation } from 'react-i18next';
import { Badge } from '@centresoutien/ui';

/**
 * Per-sheet row counts of a finished Excel export (SOU-44). Sheet names are the
 * workbook's own names (what the file actually contains), so they stay raw.
 */
export function ExcelExportSummary({ counts }: { counts: Record<string, number> }) {
  const { i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.language);
  const entries = Object.entries(counts).filter(([, count]) => count > 0);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" role="status">
      {entries.map(([sheet, count]) => (
        <Badge key={sheet} variant="neutral">
          <span dir="ltr" className="font-mono text-[11px]">
            {sheet}
          </span>
          <span aria-hidden="true">·</span>
          {numberFormat.format(count)}
        </Badge>
      ))}
    </div>
  );
}
