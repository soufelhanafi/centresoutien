import { useTranslation } from 'react-i18next';
import { Printer, Download, FileText } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@centresoutien/ui';
import { useTeacherRosterExport } from '../../hooks/teacher/use-teacher-roster-export';
import type { TeacherRosterPdfRequest } from '../../lib/teachers/teacher-roster-view';

type Props = {
  buildRequest: () => TeacherRosterPdfRequest;
  disabled: boolean;
};

/** Print / export-PDF menu for the filtered roster (SOU-299). Disabled when the
 *  filtered list is empty — there is nothing to print. */
export function TeacherRosterExportMenu({ buildRequest, disabled }: Props) {
  const { t } = useTranslation();
  const { isPending, onPrint, onExport } = useTeacherRosterExport(buildRequest);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || isPending}>
          <FileText className="h-4 w-4" aria-hidden="true" />
          {t('teachers.detail.students.export.button')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void onPrint()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t('teachers.detail.students.export.print')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onExport()}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t('teachers.detail.students.export.exportPdf')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
