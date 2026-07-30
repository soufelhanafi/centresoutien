import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { RoomInput, RoomView } from '../../lib/rooms/room-view';
import { useUpdateRoom } from '../../hooks/room/use-update-room';
import { RoomFormDialog } from './room-form-dialog';

/** Maps the read DTO back to the editable input shape. */
function toInput(room: RoomView): RoomInput {
  return { name: room.name, capacity: room.capacity };
}

/** Edit-room flow: owns the mutation, toasts the result, closes on success. */
export function EditRoomDialog({
  room,
  open,
  onOpenChange,
}: {
  room: RoomView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateRoom(room.id);

  const handleSubmit = async (values: RoomInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('rooms.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('rooms.form.error'));
    }
  };

  return (
    <RoomFormDialog
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={toInput(room)}
      pending={update.isPending}
      onSubmit={handleSubmit}
    />
  );
}
