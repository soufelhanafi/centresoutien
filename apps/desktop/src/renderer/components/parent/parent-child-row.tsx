import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Button, BilingualText } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';

/** One linked child: name (links to the student) + an inline unlink action. */
export function ParentChildRow({
  student,
  onUnlink,
  disabled,
}: {
  student: StudentView;
  onUnlink: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();

  return (
    <li className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50">
      <Link
        to="/students/$studentId"
        params={{ studentId: student.id }}
        className="flex min-w-0 flex-col gap-0.5"
      >
        <span className="truncate text-sm font-medium text-foreground">{student.name.fr}</span>
        <BilingualText
          value={student.name.ar}
          script="arabic"
          className="text-xs text-muted-foreground"
        />
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onUnlink}
        aria-label={t('parents.detail.children.unlink', { name: student.name.fr })}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </li>
  );
}
