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
import type { SubscriptionCreateResult } from '../../lib/subscriptions/subscriptions-gateway';
import type { WizardTarget } from '../../hooks/subscription/use-subscription-tab';
import { useCreateSubscription } from '../../hooks/subscription/use-create-subscription';
import { useReplaceSubscription } from '../../hooks/subscription/use-replace-subscription';
import { useSubscriptionInvoiceToast } from '../../hooks/subscription/use-subscription-invoice-toast';
import { mapSubscriptionWriteError } from '../../lib/subscriptions/subscription-write-error';
import { SubscriptionCloseFields } from './subscription-close-fields';
import { SubscriptionFormulaFields } from './subscription-formula-fields';

/**
 * The close-and-reopen wizard (SOU-65): replaces the target's current
 * subscription (if any) with a fresh one in a single atomic operation
 * (SOU-141) — never edits a subscription in place (CLAUDE.md §7).
 * With no current subscription it is a plain subscribe (create only).
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
  const showInvoiceOutcome = useSubscriptionInvoiceToast();
  const [formulaId, setFormulaId] = useState('');
  const [startMonth, setStartMonth] = useState(currentMonth);

  useEffect(() => {
    if (target) {
      const defaultMonth = currentMonth();
      setFormulaId('');
      setStartMonth(target.current ? nextMonth(defaultMonth) : defaultMonth);
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
      } catch (error) {
        const code = mapSubscriptionWriteError(error);
        toast.error(t(code ? `errors.${code}` : 'students.subscription.wizard.replaceError'));
        return;
      }
      toast.success(t('students.subscription.wizard.success'));
    } else {
      let result: SubscriptionCreateResult;
      try {
        result = await create.mutateAsync(input);
      } catch (error) {
        const code = mapSubscriptionWriteError(error);
        toast.error(t(code ? `errors.${code}` : 'students.subscription.wizard.createError'));
        return;
      }
      showInvoiceOutcome(result);
    }

    onClose();
  };

  const titleKey = target?.current ? 'changeTitle' : 'subscribeTitle';
  const descriptionKey = target?.current ? 'changeDescription' : 'subscribeDescription';

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
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
                startMonth={startMonth}
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
