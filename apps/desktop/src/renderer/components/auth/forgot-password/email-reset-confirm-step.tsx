import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { resetPasswordAfterEmailVerificationSchema } from '@centresoutien/domain';
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
import { useConfirmEmailReset } from '../../../hooks/auth/use-confirm-email-reset';

const emailConfirmSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, { message: 'invalid-code' }),
    // Same schema the email-reset use case validates against server-side, so the
    // client and server never drift on password strength (Qodo #2).
    password: resetPasswordAfterEmailVerificationSchema.shape.newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'password-mismatch',
    path: ['confirmPassword'],
  });

type EmailConfirmValues = z.infer<typeof emailConfirmSchema>;

type BlockingOutcome = 'rate-limited' | 'unreachable';

/**
 * Step 2 of the email reset (SOU-273): the owner types the emailed 6-digit code
 * and a new password. `success` hands off to the fresh-login notice;
 * `invalid-or-expired` marks the code field; the throttle / offline outcomes
 * render inline. The password rule reuses the recovery-reset strength schema.
 */
export function EmailResetConfirmStep({
  username,
  onSuccess,
}: {
  username: string;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirmEmailReset();
  const [blocking, setBlocking] = useState<BlockingOutcome | null>(null);
  const form = useForm<EmailConfirmValues>({
    resolver: zodResolver(emailConfirmSchema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setBlocking(null);
    const result = await confirm.mutateAsync({ username, code: values.code, password: values.password });
    if (result.outcome === 'success') {
      onSuccess();
      return;
    }
    if (result.outcome === 'invalid-or-expired') {
      form.setError('code', { message: 'invalid-or-expired' });
      return;
    }
    setBlocking(result.outcome);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">{t('auth.forgot.email.confirmExplainer')}</p>

        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.forgot.email.codeLabel')}</FormLabel>
              <FormControl>
                <Input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t('auth.forgot.email.codePlaceholder')}
                  dir="ltr"
                  className="text-center"
                  {...field}
                />
              </FormControl>
              {form.formState.errors.code ? (
                <p role="alert" className="text-sm text-destructive">
                  {t('auth.forgot.email.invalidCode')}
                </p>
              ) : null}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.forgot.email.newPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
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
              <FormLabel>{t('auth.forgot.email.confirmPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        {blocking ? (
          <p role="alert" className="text-sm text-destructive">
            {t(blocking === 'rate-limited' ? 'auth.forgot.email.rateLimited' : 'auth.forgot.email.unreachable')}
          </p>
        ) : null}

        <Button type="submit" disabled={confirm.isPending}>
          {confirm.isPending ? t('auth.forgot.email.submitting') : t('auth.forgot.email.submit')}
        </Button>
      </form>
    </Form>
  );
}
