import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  type SecurityQuestionKey,
  SECURITY_QUESTION_KEYS,
  verifySecurityAnswersSchema,
} from '@centresoutien/domain';
import { Button, Form } from '@centresoutien/ui';
import { useResetWithSecurityQuestions } from '../../../hooks/auth/use-reset-with-security-questions';
import { LockoutNotice } from '../lockout-notice';
import { SecurityQuestionRow } from './security-question-row';

const securityResetSchema = z.object({
  answers: z
    .array(
      z.object({
        questionKey: z
          .string()
          .refine((value) => (SECURITY_QUESTION_KEYS as readonly string[]).includes(value), {
            message: 'security-question-required',
          }),
        answer: z.string().trim().min(1, { message: 'security-answer-required' }),
      }),
    )
    .length(3),
});

export type SecurityResetValues = z.infer<typeof securityResetSchema>;

const EMPTY_ROW = { questionKey: '', answer: '' } as const;

/**
 * The security-question reset (SOU-156 last resort). The admin reproduces the
 * three questions they set (SOU-155) and answers them; the screen never reveals
 * which were chosen. Answering all three correctly returns `confirmation-required`
 * — the reset finishes through the SOU-157 email step — so this form's happy path
 * ends at the "check your email" notice, not a completed sign-in.
 */
export function SecurityQuestionsResetForm({
  onConfirmationRequired,
}: {
  onConfirmationRequired: () => void;
}) {
  const { t } = useTranslation();
  const reset = useResetWithSecurityQuestions();
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const form = useForm<SecurityResetValues>({
    resolver: zodResolver(securityResetSchema),
    defaultValues: { answers: [EMPTY_ROW, EMPTY_ROW, EMPTY_ROW] },
  });

  const clearLock = useCallback(() => setLockedUntilMs(null), []);
  const isLocked = lockedUntilMs !== null;
  const selectedKeys = form
    .watch('answers')
    .map((row) => row.questionKey)
    .filter((key): key is SecurityQuestionKey => key !== '');

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = verifySecurityAnswersSchema.parse(values);
    const result = await reset.mutateAsync(payload);
    switch (result.outcome) {
      case 'confirmation-required':
        onConfirmationRequired();
        return;
      case 'invalid-answer':
        setRemainingAttempts(result.remainingAttempts);
        return;
      case 'locked-out':
        setRemainingAttempts(null);
        setLockedUntilMs(result.lockedUntilMs);
        return;
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {[0, 1, 2].map((index) => (
          <SecurityQuestionRow
            key={index}
            control={form.control}
            index={index}
            takenKeys={selectedKeys}
            disabled={isLocked}
          />
        ))}

        {remainingAttempts !== null && !isLocked ? (
          <p role="alert" className="text-sm text-destructive">
            {t('auth.forgot.security.invalidAnswer')}{' '}
            {t('auth.attemptsRemaining', { count: remainingAttempts })}
          </p>
        ) : null}

        {isLocked ? <LockoutNotice untilMs={lockedUntilMs} onElapsed={clearLock} /> : null}

        {reset.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('auth.forgot.error')}
          </p>
        ) : null}

        <Button type="submit" disabled={isLocked || reset.isPending}>
          {reset.isPending ? t('auth.forgot.security.submitting') : t('auth.forgot.security.submit')}
        </Button>
      </form>
    </Form>
  );
}
