import { useTranslation } from 'react-i18next';
import { EmptyState, LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../hooks/use-feature';
import type { NavModule } from '../app/nav-items';

/**
 * Stand-in panel for modules whose real screens land in later issues. Every nav
 * entry routes here for now. A gated module reached by URL on a plan that lacks
 * the feature shows the full-page lock treatment — the sidebar prevents the
 * click, this guards direct navigation (defence in depth for plan gating).
 */
export function ModulePlaceholder({ module }: { module: NavModule }) {
  const { t } = useTranslation();
  const title = t(`nav.${module.id}`);
  const Icon = module.icon;
  const hasFeature = useFeature(module.feature ?? 'core.students');
  const locked = module.feature !== undefined && !hasFeature;

  const body = (
    <EmptyState
      icon={<Icon className="h-5 w-5" aria-hidden="true" />}
      title={t('shell.placeholder.title')}
      description={t('shell.placeholder.body')}
    />
  );

  return (
    <section aria-labelledby="module-title" className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <h1 id="module-title" className="text-xl font-semibold text-foreground">
        {title}
      </h1>
      <div className="mt-6 flex flex-1 items-center justify-center">
        {locked ? (
          <LockOverlay
            title={title}
            description={t('plan.locked')}
            ctaLabel={t('plan.viewPlans')}
            className="w-full max-w-md"
          >
            <div className="p-8">{body}</div>
          </LockOverlay>
        ) : (
          body
        )}
      </div>
    </section>
  );
}
