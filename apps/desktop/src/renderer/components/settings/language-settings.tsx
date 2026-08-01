import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, toast } from '@centresoutien/ui';
import { LOCALES, type Locale } from '../../i18n/direction';
import { useSetLocalePreference } from '../../hooks/settings/use-set-locale-preference';

const LOCALE_LABEL_KEYS: Readonly<Record<Locale, string>> = {
  fr: 'settings.language.fr',
  ar: 'settings.language.ar',
};

/**
 * Language section of the Settings page (SOU-31). Persists the choice to the
 * main-process preference file (survives a restart) and switches the running
 * session immediately — the two writes are independent, so a failed
 * persistence still lets the user see the language change in-session.
 */
export function LanguageSettings() {
  const { t, i18n } = useTranslation();
  const setLocale = useSetLocalePreference();
  const active = i18n.language as Locale;

  const choose = async (locale: Locale) => {
    if (locale === active || setLocale.isPending) return;
    try {
      await setLocale.mutateAsync({ locale });
    } catch {
      toast.error(t('settings.language.error'));
    }
    await i18n.changeLanguage(locale);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.language.title')}</CardTitle>
        <CardDescription>{t('settings.language.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        {LOCALES.map((locale) => (
          <Button
            key={locale}
            type="button"
            variant={locale === active ? 'default' : 'outline'}
            disabled={setLocale.isPending}
            aria-pressed={locale === active}
            onClick={() => void choose(locale)}
          >
            {t(LOCALE_LABEL_KEYS[locale])}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
