import type { EntityId, GetCenterProfile, GroupId, ReadCenterLogo, RoomId, WeeklySessionView } from '@centresoutien/domain';
import type {
  ScheduleExportPdfInput,
  ScheduleExportSessionRow,
  ScheduleExportViewFilter,
} from '../../data/pdf/schedule-pdf-input';
import type { ScheduleExportViewFilterDto } from '../../shared/ipc/contract';

export type ScheduleAssemblyDeps = {
  getCenterProfile: Pick<GetCenterProfile, 'execute'>;
  readCenterLogo: Pick<ReadCenterLogo, 'execute'>;
};

function toScheduleSessionRow(session: WeeklySessionView): ScheduleExportSessionRow {
  return {
    dayOfWeek: session.dayOfWeek,
    start: session.start,
    end: session.end,
    roomName: session.roomName,
    teacherName: session.teacherName === null ? null : { ...session.teacherName },
    subjectId: session.subjectId,
    subjectName: session.subjectName === null ? null : { ...session.subjectName },
    level: session.level,
    kind: session.kind,
  };
}

/** Narrows the already-fetched week to the requested scope by comparing the
 *  request's raw id against each session's — the only "filtering" this ticket
 *  does server-side, mirroring `ListWeekSessions`'s own client-side-filtering
 *  design note (the live grid does the equivalent narrowing in the renderer). */
function filterSessionsByView(
  sessions: readonly WeeklySessionView[],
  view: ScheduleExportViewFilterDto,
): readonly WeeklySessionView[] {
  switch (view.scope) {
    case 'full':
      return sessions;
    case 'room':
      return sessions.filter((session) => session.roomId === (view.roomId as RoomId));
    case 'teacher':
      return sessions.filter((session) => session.teacherId === (view.teacherId as EntityId));
    case 'group':
      return sessions.filter((session) => session.groupId === (view.groupId as GroupId));
  }
}

function toRenderView(view: ScheduleExportViewFilterDto): ScheduleExportViewFilter {
  switch (view.scope) {
    case 'full':
      return { scope: 'full' };
    case 'room':
      return { scope: 'room', roomName: view.roomName };
    case 'teacher':
      return { scope: 'teacher', teacherName: { ...view.teacherName } };
    case 'group':
      return {
        scope: 'group',
        subjectName: view.subjectName ? { ...view.subjectName } : null,
        level: view.level,
      };
  }
}

/** Assembles the {@link PdfLibScheduleRenderer} input from the week
 *  `ListWeekSessions` already fetched, the requested view scope, and the
 *  center profile (+ logo bytes) — pure DTO assembly, no business decisions,
 *  mirroring `buildInvoicePdfInput`. */
export async function buildSchedulePdfInput(
  deps: ScheduleAssemblyDeps,
  sessions: readonly WeeklySessionView[],
  view: ScheduleExportViewFilterDto,
  locale: 'fr' | 'ar',
): Promise<ScheduleExportPdfInput> {
  const center = await deps.getCenterProfile.execute();
  const logoBytes = center?.logoPath ? await deps.readCenterLogo.execute({ path: center.logoPath }) : null;

  return {
    locale,
    view: toRenderView(view),
    sessions: filterSessionsByView(sessions, view).map(toScheduleSessionRow),
    center: { name: center?.name ?? '', logoBytes },
  };
}
