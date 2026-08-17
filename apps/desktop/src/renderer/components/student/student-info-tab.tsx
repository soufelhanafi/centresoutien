import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BilingualText } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { formatDate } from '../../lib/format';
import { useNiveauLabel } from '../../lib/niveaux/niveau-label';

/** Read view of the student's fields. Edit lives in the detail header. */
export function StudentInfoTab({ student }: { student: StudentView }) {
  const { t, i18n } = useTranslation();
  const none = t('students.info.none');
  const levelLabel = useNiveauLabel(student.niveauId ?? null, student.level);

  const rows: { label: string; value: ReactNode }[] = [
    { label: t('students.info.nameFr'), value: student.name.fr },
    { label: t('students.info.nameAr'), value: <BilingualText value={student.name.ar} script="arabic" /> },
    { label: t('students.info.birthDate'), value: formatDate(student.birthDate, i18n.language) },
    { label: t('students.info.level'), value: levelLabel },
    { label: t('students.info.school'), value: student.school ?? none },
    { label: t('students.info.notes'), value: student.notes ?? none },
  ];

  return (
    <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {row.label}
          </dt>
          <dd className="mt-1 whitespace-pre-line break-words text-sm text-foreground">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
