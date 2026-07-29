import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@centresoutien/ui';
import type { WizardState } from '@centresoutien/domain';
import { STEP_META } from './step-meta';

/**
 * Horizontal stepper reflecting the domain sequence for this run (4 steps on
 * Essentiel, 5 with Holidays on Pro+). Completed steps show a check, the current
 * step is highlighted, upcoming steps are muted.
 */
export function WizardProgress({ state }: { state: WizardState }) {
  const { t } = useTranslation();

  return (
    <ol className="flex w-full items-center gap-2" aria-label={t('wizard.progressLabel')}>
      {state.steps.map((step, index) => {
        const isCurrent = index === state.currentIndex;
        const isDone = state.completed.has(step);
        const Icon = STEP_META[step].icon;
        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
                isDone && 'border-primary bg-primary text-primary-foreground',
                isCurrent && !isDone && 'border-primary text-primary',
                !isCurrent && !isDone && 'border-border text-muted-foreground',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isDone ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
            </span>
            <span
              className={cn(
                'text-xs',
                isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {t(`wizard.steps.${step}.label`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
