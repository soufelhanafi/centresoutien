import { useTranslation } from 'react-i18next';
import { BilingualText, Numeric } from '@centresoutien/ui';
import type { GroupKind } from '@centresoutien/domain';
import type { InvoiceLineView } from '../../lib/invoices/invoice-view';
import { formatMoneyMad } from '../../lib/format';

const kindLabelKey = (kind: GroupKind) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/** One kind-grouped subsection of the invoice's lines, with its own subtotal (CLAUDE.md §7). */
export function InvoiceLineGroup({ kind, lines }: { kind: GroupKind; lines: readonly InvoiceLineView[] }) {
  const { t, i18n } = useTranslation();
  if (lines.length === 0) return null;
  const subtotalMad = lines.reduce((sum, line) => sum + line.amountMad, 0);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {t(`invoices.detail.kind.${kindLabelKey(kind)}`)}
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <span className="text-sm text-foreground">{line.label.fr}</span>
              <BilingualText value={line.label.ar} script="arabic" className="block text-xs text-muted-foreground" />
            </div>
            <Numeric>{formatMoneyMad(line.amountMad, i18n.language)}</Numeric>
          </li>
        ))}
      </ul>
      <p className="text-end text-sm font-medium text-foreground">
        {t('invoices.detail.subtotal', { amount: formatMoneyMad(subtotalMad, i18n.language) })}
      </p>
    </div>
  );
}
