import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { adminCredentialsSchema } from '@centresoutien/domain';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
} from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';
import { WizardFooter } from '../wizard-footer';
import { useWizardNav } from '../../../hooks/wizard/use-wizard-nav';
import { useCreateAdmin } from '../../../hooks/wizard/use-create-admin';

/**
 * Confirm-password is a UI concern only, so it extends — never forks — the shared
 * domain credential schema. The confirmation field is stripped before the IPC
 * call; the domain sees exactly `AdminCredentials`.
 */
const adminFormSchema = adminCredentialsSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password-mismatch',
  });

type AdminFormValues = z.infer<typeof adminFormSchema>;

/**
 * Creates the admin account, then commits the step. This is the only wizard step
 * with real persistence today; reaching it means the earlier mandatory steps were
 * submitted, and completing it is what lets the whole first run survive a restart.
 */
export function AdminAccountStep() {
  const { t } = useTranslation();
  const { back, submit, canGoBack } = useWizardNav();
  const createAdmin = useCreateAdmin();
  const form = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async ({ username, password }) => {
    await createAdmin.mutateAsync({ username, password });
    submit();
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wizard.admin.username')}</FormLabel>
              <FormControl>
                <Input autoComplete="username" {...field} />
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
              <FormLabel>{t('wizard.admin.password')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('wizard.admin.passwordHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wizard.admin.confirmPassword')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        {createAdmin.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('wizard.admin.createError')}
          </p>
        ) : null}

        <WizardFooter
          onBack={back}
          canGoBack={canGoBack}
          nextType="submit"
          nextLabel={t('wizard.next')}
          nextPending={createAdmin.isPending}
        />
      </form>
    </Form>
  );
}
