import { useTranslation } from 'react-i18next';
import { Badge, DataTableCell, DataTableRow } from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';
import { ParentRowActions } from './parent-row-actions';

type ParentRowProps = {
  parent: ParentView;
  onOpenDetail: (parent: ParentView) => void;
};

/** One parent row: name (opens the detail sheet), phone, relation, email, actions. */
export function ParentRow({ parent, onOpenDetail }: ParentRowProps) {
  const { t } = useTranslation();

  return (
    <DataTableRow>
      <DataTableCell>
        <button
          type="button"
          onClick={() => onOpenDetail(parent)}
          className="text-start font-medium text-foreground hover:underline"
        >
          {parent.name}
        </button>
        {parent.archived && (
          <Badge variant="neutral" className="ms-2 align-middle">
            {t('parents.detail.archivedBadge')}
          </Badge>
        )}
      </DataTableCell>
      <DataTableCell>
        <span dir="ltr" className="inline-block">
          {parent.phone}
        </span>
      </DataTableCell>
      <DataTableCell>{t(`guardian.relation.${parent.relation}`)}</DataTableCell>
      <DataTableCell className="text-muted-foreground">
        <span dir="ltr" className="inline-block">
          {parent.email ?? t('parents.detail.contact.none')}
        </span>
      </DataTableCell>
      <DataTableCell className="text-end">
        <ParentRowActions parent={parent} onOpenDetail={() => onOpenDetail(parent)} />
      </DataTableCell>
    </DataTableRow>
  );
}
