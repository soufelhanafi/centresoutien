import { useTranslation } from 'react-i18next';
import { BilingualText, Numeric } from '@centresoutien/ui';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type { TeacherAttributionBreakdownEntryView } from '../../lib/payroll/teacher-payout-view';
import { formatMoneyMad } from '../../lib/format';

type PayrollBreakdownRowProps = {
  columnsCount: number;
  entries: readonly TeacherAttributionBreakdownEntryView[];
  subjectsById: ReadonlyMap<string, SubjectView>;
};

/** The per-teacher drill-down: attribution amount by subject for the expanded row. */
export function PayrollBreakdownRow({ columnsCount, entries, subjectsById }: PayrollBreakdownRowProps) {
  const { t, i18n } = useTranslation();

  return (
    <tr className="border-b border-border bg-muted/40 last:border-b-0">
      <td colSpan={columnsCount} className="px-4 py-3">
        <p className="mb-2 text-xs font-semibold text-foreground">{t('payroll.breakdown.title')}</p>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('payroll.breakdown.empty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => {
              const subject = subjectsById.get(entry.subjectId);
              return (
                <li key={entry.subjectId} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-foreground">{subject?.name.fr ?? t('payroll.unknownSubject')}</span>
                    {subject && (
                      <BilingualText value={subject.name.ar} script="arabic" className="text-xs text-muted-foreground" />
                    )}
                  </span>
                  <Numeric>{formatMoneyMad(entry.amountMad, i18n.language)}</Numeric>
                </li>
              );
            })}
          </ul>
        )}
      </td>
    </tr>
  );
}
