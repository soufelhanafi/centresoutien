import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Button } from '@centresoutien/ui';

/** Gear button on the dashboard header (SOU-231 entry point) opening the widget config. */
export function DashboardCustomizeTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label={t('dashboard.widgets.customize')}
      title={t('dashboard.widgets.customize')}
    >
      <Settings className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
