import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useCreateGroup } from '../../hooks/group/use-create-group';
import { useGroupOptions } from '../../hooks/group/use-group-options';
import { GroupFormSheet } from './group-form-sheet';
import { EMPTY_GROUP_INPUT } from './group-form';
import type { GroupNiveauFormValues } from '../../lib/niveaux/form-schemas';

/** Create-group flow: owns the mutation, toasts the result, closes on success. */
export function CreateGroupSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateGroup();
  const options = useGroupOptions();

  const handleSubmit = async (values: GroupNiveauFormValues) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('groups.form.createSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('groups.form.error'));
    }
  };

  return (
    <GroupFormSheet
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={EMPTY_GROUP_INPUT}
      options={options.data}
      pending={create.isPending}
      onSubmit={handleSubmit}
    />
  );
}
