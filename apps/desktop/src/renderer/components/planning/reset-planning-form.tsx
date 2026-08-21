import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button, Input, Label, cn } from '@centresoutien/ui';
import { formatDate } from '../../lib/format';
import type { CutoffChoice } from '../../lib/planning/reset-planning';
import type { ResetPlanningFlow } from '../../hooks/planning/use-reset-planning-flow';

const CUTOFF_OPTIONS: ReadonlyArray<{ value: CutoffChoice; labelKey: string }> = [
  { value: 'from-tomorrow', labelKey: 'planning.reset.cutoff.tomorrow' },
  { value: 'include-today', labelKey: 'planning.reset.cutoff.today' },
];

/** The danger-zone body: irreversibility warning, cutoff choice, and typed gate. */
export function ResetPlanningForm({ flow }: { flow: ResetPlanningFlow }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p>{t('planning.reset.warning')}</p>
      </div>

      <div
        className="space-y-2"
        role="radiogroup"
        aria-label={t('planning.reset.cutoff.legend')}
      >
        <p className="text-sm font-medium text-foreground">{t('planning.reset.cutoff.legend')}</p>
        <div className="grid grid-cols-2 gap-3">
          {CUTOFF_OPTIONS.map(({ value, labelKey }) => {
            const selected = flow.choice === value;
            return (
              <Button
                key={value}
                type="button"
                variant={selected ? 'default' : 'outline'}
                role="radio"
                aria-checked={selected}
                onClick={() => flow.setChoice(value)}
                className={cn(selected && 'ring-2 ring-primary ring-offset-2')}
              >
                {t(labelKey)}
              </Button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('planning.reset.cutoff.hint', { date: formatDate(flow.cutoffDate, i18n.language) })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reset-planning-confirm">
          {t('planning.reset.confirmLabel', { word: flow.confirmWord })}
        </Label>
        <Input
          id="reset-planning-confirm"
          value={flow.typed}
          onChange={(event) => flow.setTyped(event.target.value)}
          placeholder={flow.confirmWord}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
