import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';
import { ParentRow } from './parent-row';

const COLUMNS = ['1.6fr', '1.1fr', '0.9fr', '1.2fr', '56px'] as const;

type ParentTableProps = {
  parents: readonly ParentView[];
  onOpenDetail: (parent: ParentView) => void;
};

/** The parents list as an accessible grid-styled table (design 1a geometry). */
export function ParentTable({ parents, onOpenDetail }: ParentTableProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('parents.table.name')}</DataTableHead>
            <DataTableHead>{t('parents.table.phone')}</DataTableHead>
            <DataTableHead>{t('parents.table.relation')}</DataTableHead>
            <DataTableHead>{t('parents.table.email')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('parents.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {parents.map((parent) => (
            <ParentRow key={parent.id} parent={parent} onOpenDetail={onOpenDetail} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
