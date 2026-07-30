import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { StudentInput } from '@centresoutien/domain';
import { useCreateStudent } from '../../hooks/student/use-create-student';
import { StudentFormSheet } from './student-form-sheet';
import { EMPTY_STUDENT_INPUT } from './student-form';

/** Create-student flow: owns the mutation, toasts the result, closes on success. */
export function CreateStudentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateStudent();

  const handleSubmit = async (values: StudentInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('students.form.createSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('students.form.error'));
    }
  };

  return (
    <StudentFormSheet
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={EMPTY_STUDENT_INPUT}
      pending={create.isPending}
      onSubmit={handleSubmit}
    />
  );
}
