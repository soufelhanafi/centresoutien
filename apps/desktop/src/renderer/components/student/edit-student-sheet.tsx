import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { StudentInput } from '@centresoutien/domain';
import { useUpdateStudent } from '../../hooks/student/use-update-student';
import type { StudentView } from '../../lib/students/student-view';
import { StudentFormSheet } from './student-form-sheet';

/** Maps the read DTO back to the editable input shape (guardians carried as-is). */
function toInput(student: StudentView): StudentInput {
  return {
    name: { fr: student.name.fr, ar: student.name.ar },
    birthDate: student.birthDate,
    level: student.level,
    school: student.school,
    notes: student.notes,
    guardianIds: [...student.guardianIds],
  };
}

/** Edit-student flow: owns the mutation, toasts the result, closes on success. */
export function EditStudentSheet({
  student,
  open,
  onOpenChange,
}: {
  student: StudentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateStudent(student.id);

  const handleSubmit = async (values: StudentInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('students.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('students.form.error'));
    }
  };

  return (
    <StudentFormSheet
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={toInput(student)}
      pending={update.isPending}
      onSubmit={handleSubmit}
    />
  );
}
