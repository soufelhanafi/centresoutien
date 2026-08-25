import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { redeemSetupCodeInputSchema } from '@centresoutien/domain';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';
import { useRedeemSetupCode } from '../../../hooks/user/use-redeem-setup-code';
import { mapRedeemSetupCodeError } from '../../../lib/users/redeem-setup-code-error';

// The code is captured in step 1 and passed in, so this step collects only the
// identity + password. Confirm-password is a UI concern that extends — never forks
// — the shared domain schema; the confirmation field is stripped before the IPC
// call so the domain sees exactly `RedeemSetupCodeInput`.
const onboardingFormSchema = redeemSetupCodeInputSchema
  .omit({ setupCode: true })
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password-mismatch',
  });

type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;

/**
 * Step 2a of the code-first redemption (SOU-303) — first onboarding. The invited
 * staff choose their OWN full name, username, and email and set their password;
 * the role is already bound to the code from step 1. Server rejections map to a
 * field — a taken username to the username field, a bad email to the email field.
 * On success it hands control back to the login screen; the director never sees or
 * sets this password.
 */
export function SetupCodeRedeemForm({
  setupCode,
  onSuccess,
}: {
  setupCode: string;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const redeem = useRedeemSetupCode();
  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: { username: '', fullName: '', email: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async ({ username, fullName, email, newPassword }) => {
    try {
      await redeem.mutateAsync({ setupCode, username, fullName, email, newPassword });
      onSuccess();
    } catch (error) {
      // FieldMessage resolves a bare code via `errors.<code>`; the root fallback is
      // rendered with a full key directly, so it keeps its `auth.setup.*` path.
      const code = mapRedeemSetupCodeError(error);
      if (code === 'username-already-taken') {
        form.setError('username', { message: code });
      } else if (code === 'invalid-email') {
        form.setError('email', { message: code });
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
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.fullName')}</FormLabel>
              <FormControl>
                <Input autoComplete="name" autoFocus placeholder={t('auth.setup.fullNamePlaceholder')} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.username')}</FormLabel>
              <FormControl>
                <Input autoComplete="username" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.email')}</FormLabel>
              <FormControl>
                <Input type="email" inputMode="email" dir="ltr" autoComplete="email" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('auth.setup.emailHint')}</p>
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
