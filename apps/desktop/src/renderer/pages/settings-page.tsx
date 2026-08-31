import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import { useFeature } from '../hooks/use-feature';
import { useUserPermission } from '../hooks/use-user-permission';
import { HubHostingCard } from '../components/settings/hub/hub-hosting-card';
import { CenterProfileSettings } from '../components/settings/settings-page';
import { CenterHoursSettings } from '../components/center-hours/center-hours-settings';
import { CenterHoursStrandedWarning } from '../components/settings/center-hours-stranded-warning';
import { CenterHoursOverrides } from '../components/center-hours-overrides/center-hours-overrides';
import { HolidaysSettings } from '../components/holiday/holidays-settings';
import { TeamSettings } from '../components/settings/team/team-settings';
import { PasswordSettings } from '../components/settings/password-settings';
import { SecurityQuestionsSettings } from '../components/settings/security-questions-settings';
import { LanguageSettings } from '../components/settings/language-settings';
import { AppearanceSettings } from '../components/settings/appearance-settings';
import { PlanSettings } from '../components/settings/plan-settings';
import { LicenseSettings } from '../components/settings/license-settings';
import { BackupSettings } from '../components/settings/backup-settings';

/**
 * Paramètres screen (SOU-31). Eleven tabs: the center-profile editor (SOU-28),
 * the center opening-hours editor (SOU-29), the holidays manager (SOU-30),
 * password change, security questions (SOU-155), language,
 * appearance/dark-mode (SOU-144), read-only plan info, license activation
 * (SOU-104), and backup/restore (SOU-102).
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const hasSync = useFeature('sync.multi-device');
  // Assistant-visibility: team management, license, plan info, and backup/restore
  // are director-only surfaces the owner can hide from an assistant in one flag —
  // deliberately lumped rather than four separate switches (keep-it-simple).
  const hasSensitiveSettings = useUserPermission('settings.sensitive');

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
          {hasSensitiveSettings && <TabsTrigger value="team">{t('settings.tabs.team')}</TabsTrigger>}
          <TabsTrigger value="password">{t('settings.tabs.password')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.tabs.security')}</TabsTrigger>
          <TabsTrigger value="language">{t('settings.tabs.language')}</TabsTrigger>
          <TabsTrigger value="appearance">{t('settings.tabs.appearance')}</TabsTrigger>
          {hasSensitiveSettings && <TabsTrigger value="plan">{t('settings.tabs.plan')}</TabsTrigger>}
          {hasSensitiveSettings && (
            <TabsTrigger value="license">{t('settings.tabs.license')}</TabsTrigger>
          )}
          {hasSensitiveSettings && (
            <TabsTrigger value="backup">{t('settings.tabs.backup')}</TabsTrigger>
          )}
          {hasSync && <TabsTrigger value="hosting">{t('settings.tabs.hosting')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile">
          <CenterProfileSettings />
        </TabsContent>
        <TabsContent value="hours" className="flex flex-col gap-8">
          <CenterHoursSettings />
          <CenterHoursStrandedWarning />
          <CenterHoursOverrides />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysSettings />
        </TabsContent>
        {hasSensitiveSettings && (
          <TabsContent value="team">
            <TeamSettings />
          </TabsContent>
        )}
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
        {hasSensitiveSettings && (
          <TabsContent value="plan">
            <PlanSettings />
          </TabsContent>
        )}
        {hasSensitiveSettings && (
          <TabsContent value="license">
            <LicenseSettings />
          </TabsContent>
        )}
        {hasSensitiveSettings && (
          <TabsContent value="backup">
            <BackupSettings />
          </TabsContent>
        )}
        {hasSync && (
          <TabsContent value="hosting">
            <HubHostingCard />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
