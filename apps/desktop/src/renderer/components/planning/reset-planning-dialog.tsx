import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@centresoutien/ui';
import { useResetPlanningFlow } from '../../hooks/planning/use-reset-planning-flow';
import { ResetPlanningForm } from './reset-planning-form';

/**
 * Planner danger zone (SOU-295): a destructive header trigger plus the
 * typed-confirmation modal that wipes all future sessions. The caller gates the
 * whole component on `core.calendar.week` — when off, the trigger is not rendered
 * at all. Closing the dialog resets the form; a failed reset keeps it open to retry.
 */
export function ResetPlanningDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const flow = useResetPlanningFlow(() => setOpen(false));

  const handleOpenChange = (next: boolean) => {
    if (!next) flow.resetForm();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('planning.reset.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('planning.reset.title')}</DialogTitle>
          <DialogDescription>{t('planning.reset.description')}</DialogDescription>
        </DialogHeader>
        <ResetPlanningForm flow={flow} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            {t('planning.reset.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!flow.canConfirm}
            onClick={() => void flow.submit()}
          >
            {flow.isPending ? t('planning.reset.submitting') : t('planning.reset.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
