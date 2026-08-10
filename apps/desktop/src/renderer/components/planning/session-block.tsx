import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { KindBadge } from '@centresoutien/ui';
import type { PlannerSessionView } from '../../lib/planning/planner-view';
import { subjectColor } from '../../lib/planning/subject-color';
import { localizedText } from '../../lib/planning/localized-text';
import { formatTimeRange } from '../../lib/planning/time-range';

type SessionBlockProps = {
  session: PlannerSessionView;
  /** Full absolute geometry (top/height + inline-start/width for lanes) from the grid. */
  style: CSSProperties;
  onSelect: (session: PlannerSessionView) => void;
};

/**
 * One color-coded session block. The subject drives the colour (a theme-aware
 * palette slot), and exam-prep sessions carry the dashed kind badge so the two
 * tracks stay separable at a glance (CLAUDE.md §7). The whole block is a button
 * that opens the session template dialog.
 */
export function SessionBlock({ session, style, onSelect }: SessionBlockProps) {
  const { t, i18n } = useTranslation();
  const color = subjectColor(session.subjectId);
  const subject =
    session.subjectName === null
      ? t('planning.unknownSubject')
      : localizedText(session.subjectName, i18n.language);
  const teacher = session.teacherName === null ? null : localizedText(session.teacherName, i18n.language);
  const meta = [teacher, session.roomName].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      style={{
        ...style,
        backgroundColor: color.background,
        color: color.foreground,
        borderInlineStartColor: color.border,
      }}
      className="absolute flex flex-col gap-0.5 overflow-hidden rounded-md border-s-[3px] p-1.5 text-start text-xs leading-none shadow-sm ring-offset-background transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <span className="flex items-center justify-between gap-1">
        <span className="truncate font-semibold">{subject}</span>
        {session.kind === 'exam-prep' ? (
          <KindBadge kind="exam-prep" label={t('planning.kind.examPrepShort')} className="shrink-0 px-1 py-0 text-[10px]" />
        ) : null}
      </span>
      <span dir="ltr" className="tabular-nums opacity-90">
        {formatTimeRange(session.start, session.end, i18n.language)}
      </span>
      {meta ? <span className="truncate opacity-80">{meta}</span> : null}
    </button>
  );
}
