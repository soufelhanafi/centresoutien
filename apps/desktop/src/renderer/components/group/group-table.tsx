import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { GroupRow as GroupRowData, GroupStatus } from '../../lib/groups/group-view';
import { GroupRow } from './group-row';

const COLUMNS = ['1.6fr', '1fr', '1.1fr', '1fr', '96px'] as const;

/** The groups list as an accessible grid-styled table (design 1a geometry). */
export function GroupTable({
  groups,
  variant,
}: {
  groups: readonly GroupRowData[];
  variant: GroupStatus;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('groups.table.subject')}</DataTableHead>
            <DataTableHead>{t('groups.table.level')}</DataTableHead>
            <DataTableHead>{t('groups.table.teacher')}</DataTableHead>
            <DataTableHead>{t('groups.table.fill')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('groups.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} variant={variant} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
