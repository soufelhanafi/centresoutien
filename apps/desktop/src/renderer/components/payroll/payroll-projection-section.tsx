import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Badge, BilingualText, Button, DataTable, DataTableCell, DataTableHead, DataTableRow, Numeric } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type {
  TeacherPayrollProjectionView,
  TeacherProjectedAttributionView,
} from '../../lib/payroll/teacher-payout-view';
import { groupBreakdownByTeacher } from '../../lib/payroll/attribution-grouping';
import { formatMoneyMad } from '../../lib/format';

const COLUMNS = ['2fr', '1.2fr', '1fr', '1fr'] as const;

type PayrollProjectionSectionProps = {
  projections: readonly TeacherPayrollProjectionView[];
  projectedBreakdown: readonly TeacherProjectedAttributionView[];
  teachersById: ReadonlyMap<string, TeacherView>;
  subjectsById: ReadonlyMap<string, SubjectView>;
};

/**
 * The in-progress payroll projection (SOU-316): a read-only, clearly-provisional
 * "mois en cours" view over the open month, showing each teacher's collected-to-date
 * figure and projected month-end figure, expandable to the projected subject basis.
 */
export function PayrollProjectionSection({
  projections,
  projectedBreakdown,
  teachersById,
  subjectsById,
}: PayrollProjectionSectionProps) {
  const { t, i18n } = useTranslation();
  const [expandedTeacherIds, setExpandedTeacherIds] = useState<ReadonlySet<string>>(new Set());

  const breakdownByTeacher = useMemo(
    () => groupBreakdownByTeacher(projectedBreakdown),
    [projectedBreakdown],
  );

  const toggleExpanded = (teacherId: string) => {
    setExpandedTeacherIds((current) => {
      const next = new Set(current);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  };

  return (
    <section aria-labelledby="payroll-projection-title" className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 id="payroll-projection-title" className="text-base font-semibold text-foreground">
          {t('payroll.projection.title')}
        </h2>
        <Badge variant="info">{t('payroll.projection.estimate')}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('payroll.projection.subtitle')}</p>

      {projections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('payroll.projection.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <DataTable columns={COLUMNS}>
            <thead>
              <DataTableRow>
                <DataTableHead>{t('payroll.table.teacher')}</DataTableHead>
                <DataTableHead>{t('payroll.table.ruleKind')}</DataTableHead>
                <DataTableHead>{t('payroll.projection.collected')}</DataTableHead>
                <DataTableHead>{t('payroll.projection.projected')}</DataTableHead>
              </DataTableRow>
            </thead>
            <tbody>
              {projections.map((projection) => {
                const teacher = teachersById.get(projection.teacherId);
                const expanded = expandedTeacherIds.has(projection.teacherId);
                const entries = breakdownByTeacher.get(projection.teacherId) ?? [];
                return (
                  <Fragment key={projection.teacherId}>
                    <DataTableRow>
                      <DataTableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => toggleExpanded(projection.teacherId)}
                            aria-expanded={expanded}
                            aria-label={t(expanded ? 'payroll.table.collapse' : 'payroll.table.expand')}
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                          </Button>
                          <div>
                            <span className="font-medium text-foreground">
                              {teacher?.name.fr ?? t('payroll.unknownTeacher')}
                            </span>
                            {teacher && (
                              <BilingualText
                                value={teacher.name.ar}
                                script="arabic"
                                className="mt-0.5 block text-xs text-muted-foreground"
                              />
                            )}
                          </div>
                        </div>
                      </DataTableCell>
                      <DataTableCell>{t(`teachers.detail.payroll.kind.${toKindKey(projection.ruleKind)}`)}</DataTableCell>
                      <DataTableCell>
                        <Numeric>{formatMoneyMad(projection.encaisseMad, i18n.language)}</Numeric>
                      </DataTableCell>
                      <DataTableCell>
                        <Numeric>{formatMoneyMad(projection.projeteMad, i18n.language)}</Numeric>
                      </DataTableCell>
                    </DataTableRow>
                    {expanded && (
                      <tr className="border-b border-border bg-muted/40 last:border-b-0">
                        <td colSpan={COLUMNS.length} className="px-4 py-3">
                          <p className="mb-2 text-xs font-semibold text-foreground">{t('payroll.projection.basis')}</p>
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
                                        <BilingualText
                                          value={subject.name.ar}
                                          script="arabic"
                                          className="text-xs text-muted-foreground"
                                        />
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
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      )}
    </section>
  );
}

function toKindKey(kind: TeacherPayrollProjectionView['ruleKind']): 'fixedMonthly' | 'percentageOfMonthlyFees' {
  return kind === 'fixed-monthly' ? 'fixedMonthly' : 'percentageOfMonthlyFees';
}
