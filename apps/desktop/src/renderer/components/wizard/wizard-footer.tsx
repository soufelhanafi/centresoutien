import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';

type WizardFooterProps = {
  onBack: () => void;
  canGoBack: boolean;
  /** Present only for optional steps (Holidays). Its absence is the cosmetic half
   *  of non-skippability — the domain enforces the real guarantee. */
  onSkip?: () => void;
  /** Omitted when the primary action is a native form submit (Admin step). */
  onNext?: () => void;
  nextType?: 'button' | 'submit';
  nextLabel: string;
  nextPending?: boolean;
  nextDisabled?: boolean;
};

/** Shared navigation row: Back on the start side, Skip + Next on the end side. */
export function WizardFooter({
  onBack,
  canGoBack,
  onSkip,
  onNext,
  nextType = 'button',
  nextLabel,
  nextPending = false,
  nextDisabled = false,
}: WizardFooterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="ghost" onClick={onBack} disabled={!canGoBack}>
        {t('wizard.back')}
      </Button>

      <div className="flex items-center gap-3">
        {onSkip ? (
          <Button type="button" variant="ghost" onClick={onSkip}>
            {t('wizard.skip')}
          </Button>
        ) : null}
        <Button
          type={nextType}
          onClick={onNext}
          disabled={nextDisabled || nextPending}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
