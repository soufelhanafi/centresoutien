import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, SquarePen, Archive, Eye } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';
import { EditParentSheet } from './edit-parent-sheet';
import { ArchiveParentDialog } from './archive-parent-dialog';

/** Per-row actions menu. Owns its own edit-drawer and archive-dialog state. */
export function ParentRowActions({
  parent,
  onOpenDetail,
}: {
  parent: ParentView;
  onOpenDetail: () => void;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('parents.row.menu')}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpenDetail}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t('parents.row.open')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('parents.row.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('parents.row.archive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditParentSheet parent={parent} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveParentDialog parent={parent} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}
