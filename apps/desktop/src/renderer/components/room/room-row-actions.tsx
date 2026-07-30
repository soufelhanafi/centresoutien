import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, SquarePen, Archive, RotateCcw } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@centresoutien/ui';
import type { RoomStatus, RoomView } from '../../lib/rooms/room-view';
import { useRestoreRoom } from '../../hooks/room/use-restore-room';
import { EditRoomDialog } from './edit-room-dialog';
import { ArchiveRoomDialog } from './archive-room-dialog';

/**
 * Per-row actions. Active rooms get an edit/archive menu; archived rooms get a
 * single restore button. The `variant` (never the row's own flag) decides, so
 * each list renders exactly the actions that make sense for it.
 */
export function RoomRowActions({ room, variant }: { room: RoomView; variant: RoomStatus }) {
  const { t } = useTranslation();
  const restore = useRestoreRoom();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const handleRestore = async () => {
    try {
      await restore.mutateAsync(room.id);
      toast.success(t('rooms.restore.success'));
    } catch {
      toast.error(t('rooms.restore.error'));
    }
  };

  if (variant === 'archived') {
    return (
      <Button variant="outline" size="sm" disabled={restore.isPending} onClick={handleRestore}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('rooms.row.restore')}
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('rooms.row.menu')}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('rooms.row.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('rooms.row.archive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditRoomDialog room={room} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveRoomDialog room={room} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}
