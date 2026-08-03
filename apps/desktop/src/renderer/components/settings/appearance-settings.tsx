import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@centresoutien/ui';
import { useTheme } from '../../hooks/use-theme';
import type { ThemePreference } from '../../stores/theme-store';

const THEME_OPTIONS: ReadonlyArray<{ preference: ThemePreference; icon: LucideIcon; labelKey: string }> = [
  { preference: 'light', icon: Sun, labelKey: 'settings.appearance.light' },
  { preference: 'dark', icon: Moon, labelKey: 'settings.appearance.dark' },
  { preference: 'system', icon: Monitor, labelKey: 'settings.appearance.system' },
];

/**
 * Appearance section of the Settings page (SOU-144). Device-local, no IPC —
 * the preference lives in `useThemeStore` (localStorage) and is applied
 * synchronously on load by `public/theme-init.js` to avoid a flash.
 */
export function AppearanceSettings() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.appearance.title')}</CardTitle>
        <CardDescription>{t('settings.appearance.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        {THEME_OPTIONS.map(({ preference: option, icon: Icon, labelKey }) => (
          <Button
            key={option}
            type="button"
            variant={option === preference ? 'default' : 'outline'}
            aria-pressed={option === preference}
            onClick={() => setPreference(option)}
          >
            <Icon aria-hidden="true" className="size-4" />
            {t(labelKey)}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
