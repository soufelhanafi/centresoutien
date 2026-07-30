import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { ParentInput } from '@centresoutien/domain';
import { useUpdateParent } from '../../hooks/parent/use-update-parent';
import type { ParentView } from '../../lib/parents/parent-view';
import { ParentFormSheet } from './parent-form-sheet';
import type { ParentFormInput } from './parent-form';

/** Maps the read DTO back to the editable input shape. */
function toInput(parent: ParentView): ParentFormInput {
  return {
    name: parent.name,
    phone: parent.phone,
    email: parent.email,
    relation: parent.relation,
    whatsappOptIn: parent.whatsappOptIn,
  };
}

/** Edit-parent flow: owns the mutation, toasts the result, closes on success. */
export function EditParentSheet({
  parent,
  open,
  onOpenChange,
}: {
  parent: ParentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateParent(parent.id);

  const handleSubmit = async (values: ParentInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('parents.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('parents.form.error'));
    }
  };

  return (
    <ParentFormSheet
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={toInput(parent)}
      pending={update.isPending}
      onSubmit={handleSubmit}
    />
  );
}
