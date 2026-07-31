import { useTranslation } from 'react-i18next';
import { CenterProfileSettings } from '../components/settings/settings-page';
import { CenterHoursSettings } from '../components/center-hours/center-hours-settings';
import { HolidaysSettings } from '../components/holiday/holidays-settings';

/**
 * Paramètres screen. Hosts the center-profile editor (SOU-28), the center
 * opening-hours editor (SOU-29), and the holidays manager (SOU-30); further
 * settings sections mount alongside them here as they land.
 */
export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="settings-title" className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <h1 id="settings-title" className="text-xl font-semibold text-foreground">
        {t('nav.settings')}
      </h1>
      <div className="mt-6 flex flex-col gap-10">
        <CenterProfileSettings />
        <CenterHoursSettings />
        <HolidaysSettings />
      </div>
    </section>
  );
}
