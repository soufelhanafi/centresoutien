import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@centresoutien/ui';
import { useUpgradePromptStore } from '../../stores/upgrade-prompt-store';
import { minimumPlanFor } from '../../lib/plan/minimum-plan';
import { openTarifs } from '../../lib/external/open-external';

/** The shared upgrade dialog; opened from any gated surface via `useUpgradePromptStore`. */
export function UpgradeDialog() {
  const { t } = useTranslation();
  const feature = useUpgradePromptStore((state) => state.feature);
  const close = useUpgradePromptStore((state) => state.close);

  const plan = feature ? minimumPlanFor(feature) : null;

  return (
    <Dialog open={feature !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent closeLabel={t('upgrade.close')} className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <DialogTitle>{t('upgrade.title')}</DialogTitle>
          </div>
          <DialogDescription>
            {plan ? t(`upgrade.benefit.${plan}`) : null}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            {t('upgrade.later')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void openTarifs().catch(() => undefined);
              close();
            }}
          >
            {t('upgrade.viewPlans')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
