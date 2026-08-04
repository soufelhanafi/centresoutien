import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  setSecurityQuestionsSchema,
  type SecurityQuestionKey,
  type SetSecurityQuestionsInput,
} from '@centresoutien/domain';
import { Button, Form, toast } from '@centresoutien/ui';
import { useSetSecurityQuestions } from '../../hooks/settings/use-set-security-questions';
import { SecurityQuestionField } from './security-question-field';

export type SecurityQuestionsFormValues = SetSecurityQuestionsInput;

function buildDefaultValues(bank: readonly SecurityQuestionKey[]): SecurityQuestionsFormValues {
  return { questions: bank.slice(0, 3).map((questionKey) => ({ questionKey, answer: '' })) };
}

/**
 * Setup/replace form for the SOU-155 security questions (settings-page
 * scope of the ticket — answering them to reset a password is SOU-156's UI).
 * Always starts from the bank's first three keys: the backend only reports
 * whether questions exist, never which keys were chosen, so there is nothing
 * to prefill on a replace.
 */
export function SecurityQuestionsForm({ bank }: { bank: readonly SecurityQuestionKey[] }) {
  const { t } = useTranslation();
  const setQuestions = useSetSecurityQuestions();
  const defaultValues = buildDefaultValues(bank);
  const form = useForm<SecurityQuestionsFormValues>({
    resolver: zodResolver(setSecurityQuestionsSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await setQuestions.mutateAsync(values);
      toast.success(t('settings.securityQuestions.success'));
      form.reset(defaultValues);
    } catch {
      toast.error(t('settings.securityQuestions.error'));
    }
  });

  const rootErrorCode = form.formState.errors.questions?.message;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{t('settings.securityQuestions.answerHint')}</p>

        <SecurityQuestionField control={form.control} index={0} bank={bank} />
        <SecurityQuestionField control={form.control} index={1} bank={bank} />
        <SecurityQuestionField control={form.control} index={2} bank={bank} />

        {rootErrorCode && <p className="text-sm font-medium text-destructive">{t(`errors.${rootErrorCode}`)}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={setQuestions.isPending}>
            {setQuestions.isPending
              ? t('settings.securityQuestions.saving')
              : t('settings.securityQuestions.submit')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
