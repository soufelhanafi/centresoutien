import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { DataTableCell, DataTableRow, KindBadge } from '@centresoutien/ui';
import type { GroupRow } from '../../lib/groups/group-view';
import { localizedName } from '../../lib/groups/localized-name';
import { useNiveauLabel } from '../../lib/niveaux/niveau-label';
import { GroupFill } from '../group/group-fill';

/** One row of the teacher's groups list (SOU-317): subject (linking to the group
 *  detail) + niveau, kind badge, seat fill. A group has no name of its own — it is
 *  identified by its subject and level. */
export function TeacherGroupsRow({ group }: { group: GroupRow }) {
  const { t, i18n } = useTranslation();
  const levelLabel = useNiveauLabel(group.niveauId, group.level);

  return (
    <DataTableRow>
      <DataTableCell>
        <Link
          to="/groups/$groupId"
          params={{ groupId: group.id }}
          className="font-medium text-foreground hover:underline"
        >
          {localizedName(group.subjectName, i18n.language)}
        </Link>
        {levelLabel ? (
          <span className="block text-xs text-muted-foreground">{levelLabel}</span>
        ) : null}
      </DataTableCell>
      <DataTableCell>
        <KindBadge
          kind={group.kind}
          label={t(`teachers.detail.groups.kind.${group.kind === 'exam-prep' ? 'examPrep' : 'regular'}`)}
        />
      </DataTableCell>
      <DataTableCell>
        <GroupFill enrolled={group.enrolledCount} capacity={group.capacity} />
      </DataTableCell>
    </DataTableRow>
  );
}
