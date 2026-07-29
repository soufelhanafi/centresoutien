import { useTranslation } from 'react-i18next';
import { Button, cn } from '@centresoutien/ui';
import { LOCALES, type Locale } from '../../../i18n/direction';
import { WizardFooter } from '../wizard-footer';
import { useWizardNav } from '../../../hooks/wizard/use-wizard-nav';

/**
 * The center chooses the app language first. Switching is live — the whole wizard
 * re-renders in the picked locale and direction — so the director sees the result
 * before committing. A language is always selected, so this step never blocks.
 */
export function LanguageStep() {
  const { t, i18n } = useTranslation();
  const { back, submit, canGoBack } = useWizardNav();
  const active = i18n.language;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('wizard.language.legend')}>
        {LOCALES.map((locale: Locale) => {
          const selected = active === locale;
          return (
            <Button
              key={locale}
              type="button"
              variant={selected ? 'default' : 'outline'}
              role="radio"
              aria-checked={selected}
              onClick={() => void i18n.changeLanguage(locale)}
              className={cn('h-16 text-base', selected && 'ring-2 ring-primary ring-offset-2')}
            >
              {t(`wizard.language.${locale}`)}
            </Button>
          );
        })}
      </div>

      <WizardFooter
        onBack={back}
        canGoBack={canGoBack}
        onNext={submit}
        nextLabel={t('wizard.next')}
      />
    </div>
  );
}
