import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';

/** Flips between FR and AR; the label shows the language you'd switch TO. */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'ar' ? 'fr' : 'ar';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void i18n.changeLanguage(next)}
      aria-label={t('language.switch')}
    >
      {t('language.switch')}
    </Button>
  );
}
