import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, ErrorState, Skeleton, Numeric } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useGroupAttendanceSheet } from '../../hooks/attendance/use-group-attendance-sheet';
import { getRecentMonths, getAttributedMonth } from '../../lib/attendance/get-attributed-month';
import { formatDate, formatMonthShort } from '../../lib/format';
import type { GroupRow } from '../../lib/groups/group-view';
import type { AttendanceStatus } from '@centresoutien/domain';

function StatusCell({ status }: { status: AttendanceStatus | null }) {
  const { t } = useTranslation();
  if (status === null) return <span className="text-muted-foreground">—</span>;
  const letter: Record<AttendanceStatus, string> = {
    present: 'P',
    absent: 'A',
    excused: 'E',
    late: 'L',
  };
  const title = t(`groups.attendance.status.${status}`);
  return (
    <span title={title} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-foreground">
      {letter[status]}
    </span>
  );
}

function Content({ groupId, month, locale }: { groupId: string; month: string; locale: string }) {
  const { t } = useTranslation();
  const query = useGroupAttendanceSheet(groupId, month);

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />}
        title={t('attendance.groupSheet.loadError')}
      />
    );
  }

  const { sessions, students } = query.data;

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />}
        title={t('attendance.groupSheet.empty.title')}
        description={t('attendance.groupSheet.empty.body')}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="sticky start-0 bg-muted/50 px-2 py-1.5 text-start font-semibold text-muted-foreground">
              {t('attendance.groupSheet.student')}
            </th>
            {sessions.map((session) => (
              <th key={session.sessionId} className="whitespace-nowrap px-2 py-1.5 text-center font-semibold text-muted-foreground">
                <div>{formatDate(session.date, locale)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {students.map((student) => (
            <tr key={student.studentId} className="hover:bg-muted/20 transition-colors">
              <td className="sticky start-0 bg-card px-2 py-1.5 font-medium text-foreground">
                {student.name.fr}
              </td>
              {student.cells.map((status, colIdx) => (
                <td key={`${student.studentId}-${sessions[colIdx]?.sessionId ?? colIdx}`} className="px-2 py-1.5 text-center">
                  <StatusCell status={status} />
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-muted/30 font-semibold">
            <td className="sticky start-0 bg-muted/30 px-2 py-1.5 text-foreground">
              {t('attendance.groupSheet.presentCount')}
            </td>
            {sessions.map((session, sessionIdx) => {
              const count = students.reduce(
                (sum, student) => sum + (student.cells[sessionIdx] === 'present' ? 1 : 0),
                0,
              );
              return (
                <td key={session.sessionId} className="px-2 py-1.5 text-center text-foreground">
                  <Numeric>{t('attendance.groupSheet.count', { present: count, total: students.length })}</Numeric>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function GroupAttendanceSheetDialog({
  group,
  open,
  onOpenChange,
}: {
  group: GroupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const canView = useFeature('core.attendance');
  const [selectedMonth, setSelectedMonth] = useState(() => getAttributedMonth());
  const months = getRecentMonths(6);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('attendance.groupSheet.title', { name: group.subjectName.fr })}</DialogTitle>
        </DialogHeader>

        {!canView && (
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            title={t('attendance.groupSheet.locked')}
          />
        )}

        {canView && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t('attendance.groupSheet.monthLabel')}
                </label>
                <select
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {formatMonthShort(month, i18n.language)}
                    </option>
                  ))}
                </select>
              </div>

              <Button variant="outline" size="sm" className="self-end" onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                {t('attendance.groupSheet.print')}
              </Button>
            </div>

            <Content groupId={group.id} month={selectedMonth} locale={i18n.language} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
