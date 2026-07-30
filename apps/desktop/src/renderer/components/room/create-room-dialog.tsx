import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { RoomInput } from '../../lib/rooms/room-view';
import { useCreateRoom } from '../../hooks/room/use-create-room';
import { RoomFormDialog } from './room-form-dialog';
import { EMPTY_ROOM_INPUT } from './room-form';

/** Create-room flow: owns the mutation, toasts the result, closes on success. */
export function CreateRoomDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateRoom();

  const handleSubmit = async (values: RoomInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('rooms.form.createSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('rooms.form.error'));
    }
  };

  return (
    <RoomFormDialog
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={EMPTY_ROOM_INPUT}
      pending={create.isPending}
      onSubmit={handleSubmit}
    />
  );
}
