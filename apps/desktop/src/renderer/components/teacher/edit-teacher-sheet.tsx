import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { TeacherInput } from '@centresoutien/domain';
import { useUpdateTeacher } from '../../hooks/teacher/use-update-teacher';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { TeacherFormSheet } from './teacher-form-sheet';
import type { TeacherFormInput } from './teacher-form';

/**
 * Maps the read DTO back to the editable form shape. `cin`/`email` render as `''`
 * (the schema collapses empty back to `null` on submit); `subjectIds` is carried
 * unchanged so a re-save preserves the teacher's subject links until the picker
 * lands.
 */
function toFormInput(teacher: TeacherView): TeacherFormInput {
  return {
    name: { fr: teacher.name.fr, ar: teacher.name.ar },
    cin: teacher.cin ?? '',
    phone: teacher.phone,
    email: teacher.email ?? '',
    subjectIds: [...teacher.subjectIds],
  };
}

/** Edit-teacher flow: owns the mutation, toasts the result, closes on success. */
export function EditTeacherSheet({
  teacher,
  open,
  onOpenChange,
}: {
  teacher: TeacherView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateTeacher(teacher.id);

  const handleSubmit = async (values: TeacherInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('teachers.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('teachers.form.error'));
    }
  };

  return (
    <TeacherFormSheet
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={toFormInput(teacher)}
      pending={update.isPending}
      onSubmit={handleSubmit}
    />
  );
}
