import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { GroupInput } from '@centresoutien/domain';
import { useUpdateGroup } from '../../hooks/group/use-update-group';
import { useGroupOptions } from '../../hooks/group/use-group-options';
import type { GroupRow } from '../../lib/groups/group-view';
import { GroupFormSheet } from './group-form-sheet';
import type { GroupFormInput } from './group-form';

/** Maps the enriched read row back to the editable form shape. */
function toFormInput(group: GroupRow): GroupFormInput {
  return {
    subjectId: group.subjectId,
    teacherId: group.teacherId,
    level: group.level,
    capacity: group.capacity,
    kind: group.kind,
  };
}

/** Edit-group flow: owns the mutation, toasts the result, closes on success. */
export function EditGroupSheet({
  group,
  open,
  onOpenChange,
}: {
  group: GroupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateGroup(group.id);
  const options = useGroupOptions();

  const handleSubmit = async (values: GroupInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('groups.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('groups.form.error'));
    }
  };

  return (
    <GroupFormSheet
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={toFormInput(group)}
      options={options.data}
      pending={update.isPending}
      onSubmit={handleSubmit}
    />
  );
}
