import { useTranslation } from 'react-i18next';
import { Badge, DataTableCell, DataTableRow, KindBadge } from '@centresoutien/ui';
import type { TeacherRosterEntryView } from '../../lib/teachers/teacher-roster-view';
import { formatMonth } from '../../lib/format';

function nameFor(entry: TeacherRosterEntryView, language: string): string {
  const isArabic = language.startsWith('ar');
  const preferred = isArabic ? entry.name.ar : entry.name.fr;
  return preferred || entry.name.fr || entry.name.ar;
}

/** One roster row: student (name + niveau), subjects, formula, kind badges, status. */
export function TeacherRosterRow({ entry }: { entry: TeacherRosterEntryView }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const subjects = entry.subjects.map((subject) => (isArabic ? subject.name.ar : subject.name.fr));

  return (
    <DataTableRow>
      <DataTableCell>
        <span className="font-medium text-foreground">{nameFor(entry, i18n.language)}</span>
        {entry.level ? (
          <span className="block text-xs text-muted-foreground">{entry.level}</span>
        ) : null}
      </DataTableCell>
      <DataTableCell>
        <span className="text-sm text-foreground">
          {subjects.length > 0 ? subjects.join(' · ') : '—'}
        </span>
      </DataTableCell>
      <DataTableCell>
        <span className="text-sm text-foreground">{entry.formulaLabel || '—'}</span>
      </DataTableCell>
      <DataTableCell>
        <span className="flex flex-wrap gap-1">
          {entry.kinds.map((kind) => (
            <KindBadge
              key={kind}
              kind={kind}
              label={t(`teachers.detail.students.kind.${kind === 'exam-prep' ? 'examPrep' : 'regular'}`)}
            />
          ))}
        </span>
      </DataTableCell>
      <DataTableCell>
        {entry.status === 'active' ? (
          <Badge variant="success" dot>
            {t('teachers.detail.students.status.active')}
          </Badge>
        ) : (
          <Badge variant="neutral" dot>
            {entry.leftMonth
              ? t('teachers.detail.students.status.leftOn', {
                  month: formatMonth(entry.leftMonth, i18n.language),
                })
              : t('teachers.detail.students.status.left')}
          </Badge>
        )}
      </DataTableCell>
    </DataTableRow>
  );
}
