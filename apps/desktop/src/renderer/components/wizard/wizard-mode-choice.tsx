import { useTranslation } from 'react-i18next';
import { Building2, Network } from 'lucide-react';
import { Card, CardContent } from '@centresoutien/ui';
import { useWizardStore } from '../../stores/wizard-store';

/**
 * The very first first-run decision (SOU-318): create a brand-new center, or join
 * one already hosted on another laptop over the LAN. Picking a mode is
 * renderer-only state; "create" then hands off to the domain step machine
 * unchanged, "join" enters the LAN discovery branch.
 */
export function WizardModeChoice() {
  const { t } = useTranslation();
  const setMode = useWizardStore((store) => store.setMode);

  return (
    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t('wizard.mode.legend')}>
      <ModeCard
        icon={<Building2 className="h-6 w-6" aria-hidden />}
        title={t('wizard.mode.create.title')}
        description={t('wizard.mode.create.description')}
        onClick={() => setMode('create')}
      />
      <ModeCard
        icon={<Network className="h-6 w-6" aria-hidden />}
        title={t('wizard.mode.join.title')}
        description={t('wizard.mode.join.description')}
        onClick={() => setMode('join')}
      />
    </div>
  );
}

function ModeCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer text-start transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <CardContent className="flex flex-col gap-3 p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
