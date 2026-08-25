import { useTranslation } from 'react-i18next';
import { Button, toast } from '@centresoutien/ui';
import type { Locale } from '../i18n/direction';
import { useSetLocalePreference } from '../hooks/settings/use-set-locale-preference';

/**
 * Flips between FR and AR; the label shows the language you'd switch TO.
 * Also persists the choice via the same IPC path as the Settings language
 * tab, so the toggle survives a reload instead of only changing the running
 * session.
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const setLocale = useSetLocalePreference();
  const next: Locale = i18n.language === 'ar' ? 'fr' : 'ar';

  const toggle = async () => {
    try {
      await setLocale.mutateAsync({ locale: next });
    } catch {
      toast.error(t('settings.language.error'));
    }
    await i18n.changeLanguage(next);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void toggle()}
      disabled={setLocale.isPending}
      aria-label={t('language.switch')}
    >
      {t('language.switch')}
    </Button>
  );
}
