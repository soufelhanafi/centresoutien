import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useTodayIsoDate } from '../use-today-iso-date';
import { formatInteger } from '../../lib/format';
import {
  computeCutoffDate,
  isResetConfirmed,
  type CutoffChoice,
} from '../../lib/planning/reset-planning';
import { useResetPlanning } from './use-reset-planning';

export type ResetPlanningFlow = {
  choice: CutoffChoice;
  setChoice: (choice: CutoffChoice) => void;
  typed: string;
  setTyped: (typed: string) => void;
  confirmWord: string;
  cutoffDate: string;
  canConfirm: boolean;
  isPending: boolean;
  submit: () => Promise<void>;
  resetForm: () => void;
};

/**
 * Danger-zone state for "réinitialiser le planning" (SOU-295): the cutoff choice,
 * the typed confirmation gate, and the submit that toasts the outcome. `onComplete`
 * runs only on success (the caller closes the dialog); an error keeps the dialog
 * open so the director can retry. `today` comes from the app clock, never a bare
 * `new Date()`, and drives the cutoff date the presentation layer sends.
 */
export function useResetPlanningFlow(onComplete: () => void): ResetPlanningFlow {
  const { t, i18n } = useTranslation();
  const today = useTodayIsoDate();
  const reset = useResetPlanning();
  const [choice, setChoice] = useState<CutoffChoice>('from-tomorrow');
  const [typed, setTyped] = useState('');

  const confirmWord = t('planning.reset.confirmWord');
  const cutoffDate = computeCutoffDate(today, choice);
  const canConfirm = isResetConfirmed(typed, confirmWord) && !reset.isPending;

  const submit = async (): Promise<void> => {
    try {
      const result = await reset.mutateAsync(cutoffDate);
      toast.success(
        t('planning.reset.success', {
          count: result.sessionsDeleted,
          n: formatInteger(result.sessionsDeleted, i18n.language),
        }),
      );
      onComplete();
    } catch {
      toast.error(t('planning.reset.error'));
    }
  };

  const resetForm = (): void => {
    setChoice('from-tomorrow');
    setTyped('');
  };

  return {
    choice,
    setChoice,
    typed,
    setTyped,
    confirmWord,
    cutoffDate,
    canConfirm,
    isPending: reset.isPending,
    submit,
    resetForm,
  };
}
