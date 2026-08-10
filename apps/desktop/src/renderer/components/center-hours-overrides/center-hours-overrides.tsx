import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Plus } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useCenterHoursOverrides } from '../../hooks/center-hours-overrides/use-center-hours-overrides';
import { OverrideDialog } from './override-dialog';
import { OverrideRow } from './override-row';

/**
 * Dated center-hours overrides manager (SOU-165): special opening hours for a
 * period (a Ramadan schedule, a holiday week) layered over the regular weekly
 * hours. Gated behind the every-plan `settings.center-hours` flag — cosmetic
 * hiding only; the domain use cases are the real gate — so the feature check runs
 * before any data hook, and a locked plan does no work.
 */
export function CenterHoursOverrides() {
  if (!useFeature('settings.center-hours')) return null;
  return <CenterHoursOverridesContent />;
}

function CenterHoursOverridesContent() {
  const { t } = useTranslation();
  const query = useCenterHoursOverrides();
  const [createOpen, setCreateOpen] = useState(false);
  const overrides = query.data ?? [];

  return (
    <section aria-labelledby="center-hours-overrides-title" className="flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="center-hours-overrides-title" className="text-lg font-semibold text-foreground">
            {t('centerHoursOverrides.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('centerHoursOverrides.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('centerHoursOverrides.new')}
        </Button>
      </header>

      {query.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-28 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          icon={<CalendarRange className="h-5 w-5" aria-hidden="true" />}
          title={t('centerHoursOverrides.loadError.title')}
          description={t('centerHoursOverrides.loadError.body')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('centerHoursOverrides.loadError.retry')}
            </Button>
          }
        />
      ) : overrides.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-5 w-5" aria-hidden="true" />}
          title={t('centerHoursOverrides.empty.title')}
          description={t('centerHoursOverrides.empty.body')}
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              {t('centerHoursOverrides.empty.cta')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {overrides.map((override) => (
            <OverrideRow key={override.id} override={override} />
          ))}
        </ul>
      )}

      <OverrideDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
