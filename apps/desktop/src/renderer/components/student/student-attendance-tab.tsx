import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import { Badge, EmptyState, ErrorState, Numeric, Skeleton } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { useStudentAttendanceReport } from '../../hooks/attendance/use-student-attendance-report';
import { useFeature } from '../../hooks/use-feature';
import { getAttributedMonth } from '../../lib/attendance/get-attributed-month';

function getRecentMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }
  return months;
}

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function monthLabel(month: string): string {
  const [year, m] = month.split('-') as [string, string];
  return `${MONTH_NAMES[Number(m) - 1]} ${year}`;
}

function StatusBadge({ status }: { status: 'present' | 'absent' | 'excused' | 'late' }) {
  const { t } = useTranslation();
  const variant: Record<string, 'success' | 'destructive' | 'neutral' | 'warning'> = {
    present: 'success',
    absent: 'destructive',
    excused: 'neutral',
    late: 'warning',
  };
  return (
    <Badge variant={variant[status]} className="shrink-0 text-xs">
      {t(`groups.attendance.status.${status}`)}
    </Badge>
  );
}

/**
 * Student-detail attendance tab (SOU-108): month selector, absence summary
 * cards, and the session-by-session history table. Replaces the ComingSoon
 * placeholder. Fetches all groups for the month; group filtering is client-side.
 */
export function StudentAttendanceTab({ student }: { student: StudentView }) {
  const { t } = useTranslation();
  const canView = useFeature('core.attendance');
  const [selectedMonth, setSelectedMonth] = useState(() => getAttributedMonth());
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
  const query = useStudentAttendanceReport(student.id, selectedMonth);

  const groupIds = useMemo(() => {
    if (!query.isSuccess) return [];
    return [...new Set(query.data.history.map((row) => row.groupId).filter(Boolean))] as string[];
  }, [query.data, query.isSuccess]);

  const filtered = useMemo(() => {
    if (!query.isSuccess) return [];
    return selectedGroup
      ? query.data.history.filter((row) => row.groupId === selectedGroup)
      : query.data.history;
  }, [query.data, query.isSuccess, selectedGroup]);

  if (!canView) {
    return <EmptyState className="mt-4" icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />} title={t('students.attendance.locked')} />;
  }

  return (
    <section className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t('students.attendance.monthLabel')}
          </label>
          <select
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setSelectedGroup(undefined); }}
          >
            {getRecentMonths(6).map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        </div>

        {groupIds.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              {t('students.attendance.groupLabel')}
            </label>
            <select
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
              value={selectedGroup ?? ''}
              onChange={(e) => setSelectedGroup(e.target.value || undefined)}
            >
              <option value="">{t('students.attendance.allGroups')}</option>
              {groupIds.map((id) => (
                <option key={id} value={id}>{id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {query.isPending && (
        <div className="space-y-4" aria-busy="true">
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      )}

      {query.isError && (
        <ErrorState
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
          title={t('students.attendance.loadError')}
        />
      )}

      {query.isSuccess && query.data.history.length === 0 && (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
          title={t('students.attendance.empty.title')}
          description={t('students.attendance.empty.body')}
        />
      )}

      {query.isSuccess && filtered.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryCard
              label={t('students.attendance.rate')}
              value={`${query.data.summary.attendanceRatePercent} %`}
              variant={undefined}
            />
            <SummaryCard
              label={t('students.attendance.consecutiveAbsences')}
              value={t('students.attendance.consecutiveValue', { n: query.data.summary.consecutiveAbsences })}
              variant={query.data.summary.hasAbsenceStreak ? 'negative' : undefined}
            />
            <SummaryCard
              label={t('groups.attendance.status.present')}
              value={String(query.data.summary.counts.present)}
              variant={undefined}
            />
            <SummaryCard
              label={t('groups.attendance.status.absent')}
              value={String(query.data.summary.counts.absent)}
              variant={undefined}
            />
          </div>

          {query.data.summary.hasAbsenceStreak && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-px shrink-0" aria-hidden="true" />
              <span>{t('students.attendance.streakWarning')}</span>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-start">
                <tr>
                  <th className="ps-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                    {t('students.attendance.table.date')}
                  </th>
                  <th className="pe-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                    {t('students.attendance.table.status')}
                  </th>
                  <th className="pe-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                    {t('students.attendance.table.note')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => (
                  <tr key={row.sessionId} className="hover:bg-muted/30 transition-colors">
                    <td className="ps-3 py-2 text-foreground">{row.date}</td>
                    <td className="pe-3 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="pe-3 py-2 text-muted-foreground">
                      {row.note ?? t('students.attendance.noNote')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'negative' | undefined;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3 ${variant === 'negative' ? 'border-destructive/20 bg-destructive/5' : ''}`}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <Numeric className="text-lg font-semibold" data-negative={variant === 'negative'}>
        {value}
      </Numeric>
    </div>
  );
}
