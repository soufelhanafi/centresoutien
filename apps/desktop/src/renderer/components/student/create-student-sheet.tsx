import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useCreateStudent } from '../../hooks/student/use-create-student';
import { StudentFormSheet } from './student-form-sheet';
import { EMPTY_STUDENT_INPUT } from './student-form';
import type { StudentNiveauFormValues } from '../../lib/niveaux/form-schemas';

/**
 * Create-student flow: owns the mutation, toasts the result, closes on success.
 *
 * `defaultGuardianIds` seeds the new student's guardian links — used by the
 * Parent module's quick "add student" flow to pre-link the child to the guardian
 * (SOU-41). `onCreated` lets that caller refresh its own dependent queries (the
 * guardian's children list) after a successful create.
 */
export function CreateStudentSheet({
  open,
  onOpenChange,
  defaultGuardianIds = [],
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGuardianIds?: readonly string[];
  onCreated?: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateStudent();

  const handleSubmit = async (values: StudentNiveauFormValues) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('students.form.createSuccess'));
      onCreated?.();
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
      defaultValues={{ ...EMPTY_STUDENT_INPUT, guardianIds: [...defaultGuardianIds] }}
      pending={create.isPending}
      onSubmit={handleSubmit}
    />
  );
}
