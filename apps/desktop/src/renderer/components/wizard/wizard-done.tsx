import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@centresoutien/ui';

/**
 * Terminal screen shown once the domain machine reports `completed`. Its CTA hands
 * control back to the gate, which reveals the app.
 */
export function WizardDone({ onEnter }: { onEnter: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <CheckCircle2 className="h-14 w-14 text-primary" aria-hidden />
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">{t('wizard.done.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('wizard.done.body')}</p>
      </div>
      <Button type="button" onClick={onEnter} className="mt-2">
        {t('wizard.done.cta')}
      </Button>
    </div>
  );
}
