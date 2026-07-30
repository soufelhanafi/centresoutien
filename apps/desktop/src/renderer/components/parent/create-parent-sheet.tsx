import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { ParentInput } from '@centresoutien/domain';
import type { ParentView } from '../../lib/parents/parent-view';
import { useCreateParent } from '../../hooks/parent/use-create-parent';
import { ParentFormSheet } from './parent-form-sheet';
import { EMPTY_PARENT_INPUT } from './parent-form';

/**
 * Create-parent flow: owns the mutation, toasts the result, closes on success.
 *
 * `onCreated` hands the new guardian back to the caller — used by the student
 * guardians tab to pre-link the freshly created parent to the child (SOU-42).
 */
export function CreateParentSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (parent: ParentView) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateParent();

  const handleSubmit = async (values: ParentInput) => {
    try {
      const parent = await create.mutateAsync(values);
      toast.success(t('parents.form.createSuccess'));
      onCreated?.(parent);
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
