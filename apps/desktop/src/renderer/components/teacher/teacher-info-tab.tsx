import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BilingualText } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';

/** Read view of the teacher's fields. Edit lives in the detail header. */
export function TeacherInfoTab({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const none = t('teachers.info.none');

  const rows: { label: string; value: ReactNode }[] = [
    { label: t('teachers.info.nameFr'), value: teacher.name.fr },
    { label: t('teachers.info.nameAr'), value: <BilingualText value={teacher.name.ar} script="arabic" /> },
    {
      label: t('teachers.info.phone'),
      value: (
        <span dir="ltr" className="tabular-nums">
          {teacher.phone}
        </span>
      ),
    },
    { label: t('teachers.info.cin'), value: teacher.cin ?? none },
    {
      label: t('teachers.info.email'),
      value: teacher.email ? (
        <span dir="ltr" className="break-all">
          {teacher.email}
        </span>
      ) : (
        none
      ),
    },
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
