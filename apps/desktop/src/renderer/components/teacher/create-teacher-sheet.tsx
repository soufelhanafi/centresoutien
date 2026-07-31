import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { TeacherInput } from '@centresoutien/domain';
import { useCreateTeacher } from '../../hooks/teacher/use-create-teacher';
import { TeacherFormSheet } from './teacher-form-sheet';
import { EMPTY_TEACHER_INPUT } from './teacher-form';

/** Create-teacher flow: owns the mutation, toasts the result, closes on success. */
export function CreateTeacherSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateTeacher();

  const handleSubmit = async (values: TeacherInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('teachers.form.createSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('teachers.form.error'));
    }
  };

  return (
    <TeacherFormSheet
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={EMPTY_TEACHER_INPUT}
      pending={create.isPending}
      onSubmit={handleSubmit}
    />
  );
}
