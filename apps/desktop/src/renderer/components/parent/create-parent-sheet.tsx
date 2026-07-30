import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { ParentInput } from '@centresoutien/domain';
import { useCreateParent } from '../../hooks/parent/use-create-parent';
import { ParentFormSheet } from './parent-form-sheet';
import { EMPTY_PARENT_INPUT } from './parent-form';

/** Create-parent flow: owns the mutation, toasts the result, closes on success. */
export function CreateParentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateParent();

  const handleSubmit = async (values: ParentInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('parents.form.createSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('parents.form.error'));
    }
  };

  return (
    <ParentFormSheet
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={EMPTY_PARENT_INPUT}
      pending={create.isPending}
      onSubmit={handleSubmit}
    />
  );
}
