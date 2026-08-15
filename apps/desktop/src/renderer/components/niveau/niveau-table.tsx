import { useTranslation } from 'react-i18next';
import { Badge, BilingualText, DataTable, DataTableCell, DataTableHead, DataTableRow, Numeric } from '@centresoutien/ui';
import type { NiveauUsageView } from '../../lib/niveaux/niveau-view';
import { totalNiveauUsage } from '../../lib/niveaux/grouping';
import { NiveauRowActions } from './niveau-row-actions';

const COLUMNS = ['0.7fr', '1.8fr', '0.9fr', '0.9fr', '96px'] as const;

/**
 * One category's niveau list as an accessible grid-styled table, mirroring
 * `SubjectTable`. Columns: code, bilingual name, active/inactive state, total
 * usage count, actions.
 */
export function NiveauTable({ niveaux }: { niveaux: readonly NiveauUsageView[] }) {
  const { t, i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.language);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('niveaux.table.code')}</DataTableHead>
            <DataTableHead>{t('niveaux.table.name')}</DataTableHead>
            <DataTableHead>{t('niveaux.table.state')}</DataTableHead>
            <DataTableHead>{t('niveaux.table.usage')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('niveaux.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {niveaux.map((usage) => (
            <DataTableRow key={usage.niveau.id}>
              <DataTableCell>
                {usage.niveau.code ?? (
                  <span className="text-muted-foreground">{t('niveaux.table.noCode')}</span>
                )}
              </DataTableCell>
              <DataTableCell>
                <span className="font-medium text-foreground">{usage.niveau.name.fr}</span>
                <BilingualText
                  value={usage.niveau.name.ar}
                  script="arabic"
                  className="mt-0.5 block text-xs text-muted-foreground"
                />
              </DataTableCell>
              <DataTableCell>
                {usage.niveau.active ? (
                  <Badge variant="success" dot>
                    {t('niveaux.state.active')}
                  </Badge>
                ) : (
                  <Badge variant="neutral" dot>
                    {t('niveaux.state.inactive')}
                  </Badge>
                )}
              </DataTableCell>
              <DataTableCell>
                <Numeric>{numberFormat.format(totalNiveauUsage(usage))}</Numeric>
              </DataTableCell>
              <DataTableCell className="text-end">
                <NiveauRowActions usage={usage} />
              </DataTableCell>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
