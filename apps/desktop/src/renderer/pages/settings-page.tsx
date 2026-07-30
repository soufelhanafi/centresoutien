import { useTranslation } from 'react-i18next';
import { CenterHoursSettings } from '../components/center-hours/center-hours-settings';

/**
 * Paramètres screen. Hosts the center opening-hours editor (SOU-29); further
 * settings sections mount alongside it here as they land.
 */
export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="settings-title" className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <h1 id="settings-title" className="text-xl font-semibold text-foreground">
        {t('nav.settings')}
      </h1>
      <div className="mt-6">
        <CenterHoursSettings />
      </div>
    </section>
  );
}
