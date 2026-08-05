import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { recoveryCodeSchema, resetPasswordWithRecoveryCodeSchema } from '@centresoutien/domain';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
} from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';
import { useResetWithRecoveryCode } from '../../../hooks/auth/use-reset-with-recovery-code';
import { LockoutNotice } from '../lockout-notice';

const recoveryResetSchema = z
  .object({
    code: recoveryCodeSchema,
    password: resetPasswordWithRecoveryCodeSchema.shape.newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'password-mismatch',
    path: ['confirmPassword'],
  });

type RecoveryResetValues = z.infer<typeof recoveryResetSchema>;

/**
 * The recovery-code reset (SOU-156 primary path): the admin pastes one of their
 * GitHub-style codes and picks a new password. A wrong or spent code returns a
 * throttle lock rendered inline; a valid code changes the password and hands off
 * to the success screen, which forces a fresh sign-in.
 */
export function RecoveryCodeResetForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const reset = useResetWithRecoveryCode();
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);
  const form = useForm<RecoveryResetValues>({
    resolver: zodResolver(recoveryResetSchema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });

  const clearLock = useCallback(() => setLockedUntilMs(null), []);
  const isLocked = lockedUntilMs !== null;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await reset.mutateAsync({ code: values.code, password: values.password });
    if (result.outcome === 'locked-out') {
      setLockedUntilMs(result.lockedUntilMs);
      return;
    }
    onSuccess();
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.forgot.recovery.codeLabel')}</FormLabel>
              <FormControl>
                <Input
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  disabled={isLocked}
                  {...field}
                  onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.forgot.recovery.newPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={isLocked} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.forgot.recovery.confirmPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={isLocked} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        {isLocked ? <LockoutNotice untilMs={lockedUntilMs} onElapsed={clearLock} /> : null}

        {reset.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('auth.forgot.error')}
          </p>
        ) : null}

        <Button type="submit" disabled={isLocked || reset.isPending}>
          {reset.isPending ? t('auth.forgot.recovery.submitting') : t('auth.forgot.recovery.submit')}
        </Button>
      </form>
    </Form>
  );
}
