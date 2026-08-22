import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { teacherRosterGateway } from '../../lib/teachers/teacher-roster-gateway';
import type { TeacherRosterPdfRequest } from '../../lib/teachers/teacher-roster-view';

/** Print/export mutations for the roster tab, sharing one pending flag and one
 *  success/error toast pair (SOU-299), mirroring the schedule export actions. */
export function useTeacherRosterExport(buildRequest: () => TeacherRosterPdfRequest) {
  const { t } = useTranslation();
  const print = useMutation({ mutationFn: () => teacherRosterGateway.print(buildRequest()) });
  const exportPdf = useMutation({ mutationFn: () => teacherRosterGateway.export(buildRequest()) });

  const onPrint = async () => {
    try {
      await print.mutateAsync();
      toast.success(t('teachers.detail.students.export.printSuccess'));
    } catch {
      toast.error(t('teachers.detail.students.export.printError'));
    }
  };

  const onExport = async () => {
    try {
      const { savedPath } = await exportPdf.mutateAsync();
      if (savedPath !== null) toast.success(t('teachers.detail.students.export.exportSuccess'));
    } catch {
      toast.error(t('teachers.detail.students.export.exportError'));
    }
  };

  return { isPending: print.isPending || exportPdf.isPending, onPrint, onExport };
}
