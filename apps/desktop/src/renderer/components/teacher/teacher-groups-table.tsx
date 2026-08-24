import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { GroupRow } from '../../lib/groups/group-view';
import { TeacherGroupsRow } from './teacher-groups-row';

const COLUMNS = ['1.6fr', '1fr', '1.2fr'] as const;

/** The teacher's filtered groups as an accessible grid-styled table (SOU-317). */
export function TeacherGroupsTable({ groups }: { groups: readonly GroupRow[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('teachers.detail.groups.table.group')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.groups.table.kind')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.groups.table.fill')}</DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {groups.map((group) => (
            <TeacherGroupsRow key={group.id} group={group} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
