import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, TriangleAlert } from 'lucide-react';
import { EmptyState } from '@centresoutien/ui';
import { localizedText } from '../../lib/planning/localized-text';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import type { GeneratorPreviewResult, GeneratorRange } from '../../lib/planning/session-generator-gateway';
import type { GeneratorDecisions } from '../../hooks/planning/use-generator-decisions';
import { conflictsByGroup, summarizeProposals } from '../../lib/planning/session-generator-view';
import { GeneratorPreviewGroup } from './generator-preview-group';

/**
 * The dry-run preview step (SOU-159): a headline of how many sessions across how
 * many groups the run would create, a banner when any block clashes, and the
 * per-group expandable breakdown. Reads only the preview result — **zero writes**
 * happen until the admin confirms in the dialog footer. The session count is an
 * upper bound (holidays are skipped only at commit), labelled "≈" accordingly.
 */
export function SessionGeneratorPreview({
  result,
  range,
  options,
  decisions,
}: {
  result: GeneratorPreviewResult;
  range: GeneratorRange;
  options: SessionFormOptions;
  decisions: GeneratorDecisions;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const groupLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of options.groups) {
      const subject = group.subjectName === null ? t('planning.unknownSubject') : localizedText(group.subjectName, locale);
      map.set(group.id, group.level === null ? subject : `${subject} — ${group.level}`);
    }
    return map;
  }, [options.groups, locale, t]);

  const roomNames = useMemo(() => new Map(options.rooms.map((room) => [room.id, room.name])), [options.rooms]);
  const byGroup = useMemo(() => conflictsByGroup(result.conflicts), [result.conflicts]);
  const summary = useMemo(() => summarizeProposals(result.proposals, range), [result.proposals, range]);

  const groupLabel = (groupId: string): string => groupLabels.get(groupId) ?? groupId;
  const roomName = (roomId: string): string => roomNames.get(roomId) ?? roomId;
  const visibleProposals = result.proposals.filter((proposal) => proposal.blocks.length > 0);

  if (visibleProposals.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
        title={t('planning.generator.preview.emptyTitle')}
        description={t('planning.generator.preview.emptyBody')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          {t('planning.generator.preview.summary', { sessions: summary.sessions, groups: summary.groups })}
        </p>
        <p className="text-xs text-muted-foreground">{t('planning.generator.preview.estimateHint')}</p>
      </div>

      {result.conflicts.length > 0 ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('planning.generator.preview.conflictsBanner', { count: result.conflicts.length })}
        </p>
      ) : null}

      <ul className="space-y-2">
        {visibleProposals.map((proposal) => (
          <li key={proposal.groupId}>
            <GeneratorPreviewGroup
              proposal={proposal}
              groupLabel={groupLabel(proposal.groupId)}
              roomName={roomName}
              conflicts={byGroup.get(proposal.groupId) ?? []}
              decisions={decisions}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
