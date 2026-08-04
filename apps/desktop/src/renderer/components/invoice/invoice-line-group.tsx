import { useTranslation } from 'react-i18next';
import { BilingualText, Numeric } from '@centresoutien/ui';
import type { GroupKind } from '@centresoutien/domain';
import type { InvoiceLineView } from '../../lib/invoices/invoice-view';
import { formatMoneyMad } from '../../lib/format';

const kindLabelKey = (kind: GroupKind) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/** One kind-grouped tbody: section heading row, the lines, and the kind's subtotal (CLAUDE.md §7). */
export function InvoiceLineGroup({ kind, lines }: { kind: GroupKind; lines: readonly InvoiceLineView[] }) {
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
            <Numeric>{formatMoneyMad(line.amountMad, i18n.language)}</Numeric>
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
