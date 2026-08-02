import { useTranslation } from 'react-i18next';
import { Badge, BilingualText, DataTableCell, DataTableRow, Numeric } from '@centresoutien/ui';
import type { SubjectStatus, SubjectUsageView } from '../../lib/subjects/subject-view';
import { SubjectRowActions } from './subject-row-actions';

/** One subject row: code, bilingual name, active/inactive state, in-use count, actions. */
export function SubjectRow({ usage, variant }: { usage: SubjectUsageView; variant: SubjectStatus }) {
  const { t, i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.language);

  return (
    <DataTableRow>
      <DataTableCell>
        {usage.subject.code ?? <span className="text-muted-foreground">{t('subjects.table.noCode')}</span>}
      </DataTableCell>
      <DataTableCell>
        <span className="font-medium text-foreground">{usage.subject.name.fr}</span>
        <BilingualText
          value={usage.subject.name.ar}
          script="arabic"
          className="mt-0.5 block text-xs text-muted-foreground"
        />
      </DataTableCell>
      <DataTableCell>
        {usage.subject.active ? (
          <Badge variant="success" dot>
            {t('subjects.state.active')}
          </Badge>
        ) : (
          <Badge variant="neutral" dot>
            {t('subjects.state.inactive')}
          </Badge>
        )}
      </DataTableCell>
      <DataTableCell>
        <Numeric>{numberFormat.format(usage.inUseCount)}</Numeric>
      </DataTableCell>
      <DataTableCell className="text-end">
        <SubjectRowActions usage={usage} variant={variant} />
      </DataTableCell>
    </DataTableRow>
  );
}
