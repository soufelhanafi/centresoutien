import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { recoverPasswordWithSetupCodeInputSchema } from '@centresoutien/domain';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';
import { useRecoverPassword } from '../../../hooks/user/use-recover-password';
import { mapRedeemSetupCodeError } from '../../../lib/users/redeem-setup-code-error';

// The code is captured in step 1 and passed in, so this step collects only the new
// password. Confirm-password extends the shared domain schema and is stripped
// before the IPC call.
const recoveryFormSchema = recoverPasswordWithSetupCodeInputSchema
  .omit({ setupCode: true })
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password-mismatch',
  });

type RecoveryFormValues = z.infer<typeof recoveryFormSchema>;

/**
 * Step 2b of the code-first redemption (SOU-303) — recovery. An already-onboarded
 * staff member whose director re-issued their code sets a NEW password only; their
 * username / full name / email are already on file and are not re-collected. On
 * success it hands control back to the login screen.
 */
export function SetupCodeRecoveryForm({
  setupCode,
  onSuccess,
}: {
  setupCode: string;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const recover = useRecoverPassword();
  const form = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoveryFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async ({ newPassword }) => {
    try {
      await recover.mutateAsync({ setupCode, newPassword });
      onSuccess();
    } catch (error) {
      const code = mapRedeemSetupCodeError(error);
      form.setError('root', { message: code ? `errors.${code}` : 'auth.setup.error' });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">{t('auth.setup.recoveryHint')}</p>

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.newPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoFocus autoComplete="new-password" {...field} />
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

        <Button type="submit" disabled={recover.isPending}>
          {recover.isPending ? t('auth.setup.submitting') : t('auth.setup.submit')}
        </Button>
      </form>
    </Form>
  );
}
