import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BilingualText, DataTableCell, DataTableRow, KindBadge } from '@centresoutien/ui';
import type { GroupRow as GroupRowData, GroupStatus } from '../../lib/groups/group-view';
import { localizedName } from '../../lib/groups/localized-name';
import { GroupFill } from './group-fill';
import { GroupRowActions } from './group-row-actions';

/**
 * One group row: bilingual subject + kind badge, level, teacher, room, fill %,
 * actions. Active rows link to the detail page; archived rows show the subject as
 * plain text (their only action is restore), mirroring the Teachers list.
 */
export function GroupRow({
  group,
  variant,
}: {
  group: GroupRowData;
  variant: GroupStatus;
}) {
  const { t, i18n } = useTranslation();
  const subjectFr = group.subjectName.fr;

  return (
    <DataTableRow>
      <DataTableCell>
        <div className="flex items-center gap-2">
          {variant === 'archived' ? (
            <span className="font-medium text-foreground">{subjectFr}</span>
          ) : (
            <Link
              to="/groups/$groupId"
              params={{ groupId: group.id }}
              className="font-medium text-foreground hover:underline"
            >
              {subjectFr}
            </Link>
          )}
          <KindBadge
            kind={group.kind}
            label={t(`groups.kind.${group.kind === 'exam-prep' ? 'examPrep' : 'regular'}`)}
          />
        </div>
        <BilingualText
          value={group.subjectName.ar}
          script="arabic"
          className="mt-0.5 block text-xs text-muted-foreground"
        />
      </DataTableCell>
      <DataTableCell>{group.level}</DataTableCell>
      <DataTableCell className="text-muted-foreground">
        {group.teacherName ? localizedName(group.teacherName, i18n.language) : t('groups.table.unassigned')}
      </DataTableCell>
      <DataTableCell className="text-muted-foreground">{group.roomName}</DataTableCell>
      <DataTableCell>
        <GroupFill enrolled={group.enrolledCount} capacity={group.capacity} />
      </DataTableCell>
      <DataTableCell className="text-end">
        <GroupRowActions group={group} variant={variant} />
      </DataTableCell>
    </DataTableRow>
  );
}
