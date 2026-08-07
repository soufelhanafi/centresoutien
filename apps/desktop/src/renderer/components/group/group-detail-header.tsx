import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Archive, CalendarCheck, FileSpreadsheet, SquarePen } from 'lucide-react';
import { Badge, BilingualText, Button, KindBadge } from '@centresoutien/ui';
import type { GroupRow } from '../../lib/groups/group-view';
import { localizedName } from '../../lib/groups/localized-name';
import { useFeature } from '../../hooks/use-feature';
import { TakeAttendanceSheet } from '../attendance/take-attendance-sheet';
import { GroupAttendanceSheetDialog } from '../attendance/group-attendance-sheet-dialog';
import { GroupFill } from './group-fill';
import { EditGroupSheet } from './edit-group-sheet';
import { ArchiveGroupDialog } from './archive-group-dialog';

/** One labelled meta chip in the detail header. */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Detail-page header: back link, subject + kind/archived badges, meta, edit + archive. */
export function GroupDetailHeader({
  group,
  onArchived,
}: {
  group: GroupRow;
  onArchived: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const canTakeAttendance = useFeature('core.attendance');
  const teacher = group.teacherName
    ? localizedName(group.teacherName, i18n.language)
    : t('groups.table.unassigned');

  return (
    <header className="flex flex-col gap-4">
      <Link
        to="/groups"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        {t('groups.detail.back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{group.subjectName.fr}</h1>
            <KindBadge
              kind={group.kind}
              label={t(`groups.kind.${group.kind === 'exam-prep' ? 'examPrep' : 'regular'}`)}
            />
            {group.archived && <Badge variant="neutral">{t('groups.detail.archivedBadge')}</Badge>}
          </div>
          <BilingualText
            value={group.subjectName.ar}
            script="arabic"
            className="text-sm text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2">
          {canTakeAttendance && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAttendanceOpen(true)}>
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                {t('groups.attendance.action')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                {t('attendance.groupSheet.title', { name: group.subjectName.fr.slice(0, 12) })}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('groups.detail.edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('groups.row.archive')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6 rounded-xl border border-border bg-card p-4">
        <Meta label={t('groups.detail.meta.teacher')} value={teacher} />
        <Meta label={t('groups.detail.meta.level')} value={group.level} />
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('groups.detail.meta.capacity')}
          </span>
          <GroupFill enrolled={group.enrolledCount} capacity={group.capacity} />
        </div>
      </div>

      <TakeAttendanceSheet group={group} open={attendanceOpen} onOpenChange={setAttendanceOpen} />
      <GroupAttendanceSheetDialog group={group} open={sheetOpen} onOpenChange={setSheetOpen} />
      <EditGroupSheet group={group} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveGroupDialog
        group={group}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onArchived={onArchived}
      />
    </header>
  );
}
