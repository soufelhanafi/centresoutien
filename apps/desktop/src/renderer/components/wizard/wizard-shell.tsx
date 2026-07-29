import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardStepId } from '@centresoutien/domain';
import { STEP_META } from './step-meta';

/**
 * Consistent header for the active step: its icon, translated title, and
 * description. The interactive body (form or stub) is passed as children so each
 * step stays focused on its own content.
 */
export function WizardShell({ step, children }: { step: WizardStepId; children: ReactNode }) {
  const { t } = useTranslation();
  const Icon = STEP_META[step].icon;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{t(`wizard.steps.${step}.title`)}</h2>
          <p className="text-sm text-muted-foreground">{t(`wizard.steps.${step}.description`)}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
