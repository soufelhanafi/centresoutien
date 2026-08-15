import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { redeemSetupCodeInputSchema } from '@centresoutien/domain';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';
import { useRedeemSetupCode } from '../../../hooks/user/use-redeem-setup-code';
import { mapRedeemSetupCodeError } from '../../../lib/users/redeem-setup-code-error';

// Confirm-password is a UI concern only, so it extends — never forks — the shared
// domain schema (mirrors PasswordSettings). The confirmation field is stripped
// before the IPC call; the domain sees exactly `RedeemSetupCodeInput`.
const redeemFormSchema = redeemSetupCodeInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password-mismatch',
  });

type RedeemFormValues = z.infer<typeof redeemFormSchema>;

/**
 * The first-login redeem form (SOU-256): an invited employee enters their
 * username, the one-time setup code the director handed them, and the password
 * they choose. Field validation is the shared domain schema (codes resolved to
 * FR/AR via `errors.*`); server rejections map to a specific field — a bad
 * username to the username field, and invalid/expired/already-redeemed codes to
 * the setup-code field as distinct messages. On success it hands control back to
 * the login screen; the director never sees or sets this password.
 */
export function SetupCodeRedeemForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const redeem = useRedeemSetupCode();
  const form = useForm<RedeemFormValues>({
    resolver: zodResolver(redeemFormSchema),
    defaultValues: { username: '', setupCode: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async ({ username, setupCode, newPassword }) => {
    try {
      await redeem.mutateAsync({ username, setupCode, newPassword });
      onSuccess();
    } catch (error) {
      const code = mapRedeemSetupCodeError(error);
      if (code === 'user-not-found') {
        form.setError('username', { message: code });
      } else if (code) {
        form.setError('setupCode', { message: code });
      } else {
        form.setError('root', { message: 'auth.setup.error' });
      }
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.username')}</FormLabel>
              <FormControl>
                <Input autoComplete="username" autoFocus {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="setupCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.code')}</FormLabel>
              <FormControl>
                <Input autoComplete="off" dir="ltr" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('auth.setup.codeHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.newPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('auth.setup.passwordHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.confirmPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root ? (
          <p role="alert" className="text-sm text-destructive">
            {t(form.formState.errors.root.message ?? 'auth.setup.error')}
          </p>
        ) : null}

        <Button type="submit" disabled={redeem.isPending}>
          {redeem.isPending ? t('auth.setup.submitting') : t('auth.setup.submit')}
        </Button>
      </form>
    </Form>
  );
}
