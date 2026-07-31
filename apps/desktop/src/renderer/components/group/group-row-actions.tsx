import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal, SquarePen, Archive, Eye, RotateCcw } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@centresoutien/ui';
import type { GroupRow, GroupStatus } from '../../lib/groups/group-view';
import { useRestoreGroup } from '../../hooks/group/use-restore-group';
import { EditGroupSheet } from './edit-group-sheet';
import { ArchiveGroupDialog } from './archive-group-dialog';

/**
 * Per-row actions. Active groups get an open/edit/archive menu; archived groups
 * get a single restore button. The `variant` (never the row's own flag) decides,
 * mirroring `TeacherRowActions`.
 */
export function GroupRowActions({
  group,
  variant,
}: {
  group: GroupRow;
  variant: GroupStatus;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const restore = useRestoreGroup();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const open = () => navigate({ to: '/groups/$groupId', params: { groupId: group.id } });

  const handleRestore = async () => {
    try {
      await restore.mutateAsync(group.id);
      toast.success(t('groups.restore.success'));
    } catch {
      toast.error(t('groups.restore.error'));
    }
  };

  if (variant === 'archived') {
    return (
      <Button variant="outline" size="sm" disabled={restore.isPending} onClick={handleRestore}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('groups.row.restore')}
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('groups.row.menu')}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={open}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t('groups.row.open')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('groups.row.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('groups.row.archive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditGroupSheet group={group} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveGroupDialog group={group} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}
