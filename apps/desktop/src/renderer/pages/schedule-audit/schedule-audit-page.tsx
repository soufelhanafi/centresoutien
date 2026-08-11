import { useTranslation } from 'react-i18next';
import { LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useStrandedSessions } from '../../hooks/schedule-audit/use-stranded-sessions';
import { ScheduleAuditList, type ScheduleAuditStatus } from '../../components/schedule-audit/schedule-audit-list';

/**
 * Schedule audit (SOU-201): a review list of persisted sessions the center's
 * effective (override-aware) hours or a holiday now place outside every valid
 * window. Review and cancel only — never auto-delete. Gated by
 * `settings.center-hours`, the same flag that owns center-hours configuration.
 */
export function ScheduleAuditPage() {
  const { t } = useTranslation();
  const hasCenterHours = useFeature('settings.center-hours');
  const upgradeCta = useUpgradeCta('settings.center-hours');
  const query = useStrandedSessions({ enabled: hasCenterHours });

  const stranded = query.data ?? [];
  const status: ScheduleAuditStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : stranded.length > 0
        ? 'ready'
        : 'empty';

  const content = (
    <section aria-labelledby="schedule-audit-title" className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="schedule-audit-title" className="text-xl font-semibold text-foreground">
          {t('scheduleAudit.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('scheduleAudit.subtitle')}</p>
      </header>

      <ScheduleAuditList status={status} stranded={stranded} onRetry={() => void query.refetch()} />
    </section>
  );

  if (!hasCenterHours) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <LockOverlay
          title={t('scheduleAudit.title')}
          description={t('plan.locked')}
          ctaLabel={upgradeCta.ctaLabel}
          onCta={upgradeCta.onCta}
        >
          <div className="p-8">{content}</div>
        </LockOverlay>
      </div>
    );
  }

  return content;
}
