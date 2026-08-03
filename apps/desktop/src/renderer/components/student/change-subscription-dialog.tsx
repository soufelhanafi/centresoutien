import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@centresoutien/ui';
import type { FormulaView } from '../../lib/formulas/formula-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import { currentMonth, nextMonth } from '../../lib/subscriptions/subscription-month';
import type { SubscriptionInput } from '../../lib/subscriptions/subscription-view';
import type { WizardTarget } from '../../hooks/subscription/use-subscription-tab';
import { useCreateSubscription } from '../../hooks/subscription/use-create-subscription';
import { useReplaceSubscription } from '../../hooks/subscription/use-replace-subscription';
import { SubscriptionCloseFields } from './subscription-close-fields';
import { SubscriptionFormulaFields } from './subscription-formula-fields';

/**
 * The close-and-reopen wizard (SOU-65): closes the target's current subscription
 * (if any) at `endMonth`, then creates a fresh one from `startMonth` onward for
 * the same kind — never edits a subscription in place (CLAUDE.md §7). With no
 * current subscription it is a plain subscribe (create only). The two writes are
 * NOT atomic (the domain models this as two independent use cases), so a create
 * failure after a successful close gets its own message rather than a generic
 * one, since the student is left with no active subscription for that kind.
 */
export function ChangeSubscriptionDialog({
  studentId,
  target,
  formulas,
  subjects,
  onClose,
}: {
  studentId: string;
  target: WizardTarget | null;
  formulas: readonly FormulaView[];
  subjects: readonly SubjectView[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateSubscription(studentId);
  const replace = useReplaceSubscription(studentId);
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [formulaId, setFormulaId] = useState('');
  const [startMonth, setStartMonth] = useState(currentMonth);

  useEffect(() => {
    if (target) {
      const defaultEnd = currentMonth();
      setEndMonth(defaultEnd);
      setFormulaId('');
      setStartMonth(target.current ? nextMonth(defaultEnd) : defaultEnd);
    }
  }, [target]);

  const kindFormulas = formulas.filter((formula) => formula.kind === target?.kind);
  const selectedFormula = kindFormulas.find((formula) => formula.id === formulaId);
  const pending = create.isPending || replace.isPending;
  const canSubmit =
    target !== null && selectedFormula !== undefined && startMonth !== '' && !pending;

  const handleConfirm = async () => {
    if (!target || !selectedFormula) return;
    const input: SubscriptionInput = {
      studentId,
      formulaId: selectedFormula.id,
      kind: target.kind,
      subjectIds: [...selectedFormula.subjectIds],
      startMonth,
      endMonth: null,
    };

    if (target.current) {
      try {
        await replace.mutateAsync({ ...input, activeSubscriptionId: target.current.id });
      } catch {
        toast.error(t('students.subscription.wizard.replaceError'));
        return;
      }
    } else {
      try {
        await create.mutateAsync(input);
      } catch {
        toast.error(t('students.subscription.wizard.createError'));
        return;
      }
    }

    toast.success(t('students.subscription.wizard.success'));
    onClose();
  };

  const titleKey = target?.current ? 'changeTitle' : 'subscribeTitle';
  const descriptionKey = target?.current ? 'changeDescription' : 'subscribeDescription';

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('students.subscription.wizard.cancel')}>
        <DialogHeader>
          <DialogTitle>{t(`students.subscription.wizard.${titleKey}`)}</DialogTitle>
          <DialogDescription>{t(`students.subscription.wizard.${descriptionKey}`)}</DialogDescription>
        </DialogHeader>

        {target && (
          <div className="flex flex-col gap-4 py-2">
            {target.current && (
              <SubscriptionCloseFields
                current={target.current}
                formulas={formulas}
                subjects={subjects}
                endMonth={endMonth}
                onEndMonthChange={setEndMonth}
              />
            )}
            <SubscriptionFormulaFields
              formulas={kindFormulas}
              formulaId={formulaId}
              onFormulaIdChange={setFormulaId}
              startMonth={startMonth}
              onStartMonthChange={setStartMonth}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('students.subscription.wizard.cancel')}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleConfirm}>
            {pending ? t('students.subscription.wizard.confirming') : t('students.subscription.wizard.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
