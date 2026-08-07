import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { CenterProfileSettings } from '../components/settings/settings-page';
import { CenterHoursSettings } from '../components/center-hours/center-hours-settings';
import { HolidaysSettings } from '../components/holiday/holidays-settings';
import { PasswordSettings } from '../components/settings/password-settings';
import { SecurityQuestionsSettings } from '../components/settings/security-questions-settings';
import { LanguageSettings } from '../components/settings/language-settings';
import { AppearanceSettings } from '../components/settings/appearance-settings';
import { PlanSettings } from '../components/settings/plan-settings';
import { BackupSettings } from '../components/settings/backup-settings';

/**
 * Paramètres screen (SOU-31). Eight tabs: the center-profile editor (SOU-28),
 * the center opening-hours editor (SOU-29), the holidays manager (SOU-30),
 * password change, security questions (SOU-155), language,
 * appearance/dark-mode (SOU-144), read-only plan info, and backup/restore
 * (SOU-102).
 */
export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="settings-title" className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <h1 id="settings-title" className="text-xl font-semibold text-foreground">
        {t('nav.settings')}
      </h1>
      <Tabs defaultValue="profile" className="mt-6 flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="profile">{t('settings.tabs.profile')}</TabsTrigger>
          <TabsTrigger value="hours">{t('settings.tabs.hours')}</TabsTrigger>
          <TabsTrigger value="holidays">{t('settings.tabs.holidays')}</TabsTrigger>
          <TabsTrigger value="password">{t('settings.tabs.password')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.tabs.security')}</TabsTrigger>
          <TabsTrigger value="language">{t('settings.tabs.language')}</TabsTrigger>
          <TabsTrigger value="appearance">{t('settings.tabs.appearance')}</TabsTrigger>
          <TabsTrigger value="plan">{t('settings.tabs.plan')}</TabsTrigger>
          <TabsTrigger value="backup">{t('settings.tabs.backup')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <CenterProfileSettings />
        </TabsContent>
        <TabsContent value="hours">
          <CenterHoursSettings />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysSettings />
        </TabsContent>
        <TabsContent value="password">
          <PasswordSettings />
        </TabsContent>
        <TabsContent value="security">
          <SecurityQuestionsSettings />
        </TabsContent>
        <TabsContent value="language">
          <LanguageSettings />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="plan">
          <PlanSettings />
        </TabsContent>
        <TabsContent value="backup">
          <BackupSettings />
        </TabsContent>
      </Tabs>
    </section>
  );
}
