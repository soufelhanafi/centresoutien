import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { BilingualText, Button, Numeric } from '@centresoutien/ui';
import type { GroupKind } from '@centresoutien/domain';
import type { InvoiceLineView } from '../../lib/invoices/invoice-view';
import { formatMoneyMad } from '../../lib/format';
import { localizedText } from '../../lib/planning/localized-text';

const kindLabelKey = (kind: GroupKind) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/** One kind-grouped tbody: section heading row, the lines, and the kind's subtotal
 *  (CLAUDE.md §7). `onEditLine` (passed on draft invoices only, SOU-289) adds a
 *  per-line amount-override button next to the amount. */
export function InvoiceLineGroup({
  kind,
  lines,
  onEditLine,
}: {
  kind: GroupKind;
  lines: readonly InvoiceLineView[];
  onEditLine?: ((line: InvoiceLineView) => void) | undefined;
}) {
  const { t, i18n } = useTranslation();
  if (lines.length === 0) return null;
  const subtotalMad = lines.reduce((sum, line) => sum + line.amountMad, 0);

  return (
    <tbody>
      <tr className="bg-muted/30">
        <th
          scope="colgroup"
          colSpan={2}
          className="px-6 py-2 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t(`invoices.detail.kind.${kindLabelKey(kind)}`)}
        </th>
      </tr>
      {lines.map((line) => (
        <tr key={line.id} className="border-t border-border/70">
          <td className="px-6 py-3.5">
            <span className="text-sm text-foreground">{line.label.fr}</span>
            <BilingualText value={line.label.ar} script="arabic" className="block text-xs text-muted-foreground" />
          </td>
          <td className="px-6 py-3.5 text-end align-top">
            <span className="inline-flex items-center gap-1">
              <Numeric>{formatMoneyMad(line.amountMad, i18n.language)}</Numeric>
              {onEditLine && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label={t('invoices.detail.lineEdit.action', {
                    label: localizedText(line.label, i18n.language),
                  })}
                  onClick={() => onEditLine(line)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </span>
          </td>
        </tr>
      ))}
      <tr className="border-t border-border/70">
        <td className="px-6 py-2.5 text-end text-xs font-medium text-muted-foreground">
          {t('invoices.detail.subtotal')}
        </td>
        <td className="px-6 py-2.5 text-end">
          <Numeric className="font-medium text-foreground">{formatMoneyMad(subtotalMad, i18n.language)}</Numeric>
        </td>
      </tr>
    </tbody>
  );
}
