import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@centresoutien/ui';
import { useArchiveRoom } from '../../hooks/room/use-archive-room';
import type { RoomView } from '../../lib/rooms/room-view';

/** Confirms archiving (soft delete) a room; the row then leaves the active list. */
export function ArchiveRoomDialog({
  room,
  open,
  onOpenChange,
}: {
  room: RoomView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const archive = useArchiveRoom();

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(room.id);
      toast.success(t('rooms.archive.success'));
      onOpenChange(false);
    } catch {
      toast.error(t('rooms.archive.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('rooms.archive.title')}</DialogTitle>
          <DialogDescription>{t('rooms.archive.body', { name: room.name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('rooms.archive.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={archive.isPending} onClick={handleConfirm}>
            {t('rooms.archive.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
