import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { changeAdminPasswordSchema } from '@centresoutien/domain';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  toast,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useChangePassword } from '../../hooks/settings/use-change-password';
import { mapChangePasswordError } from '../../lib/settings/change-password-error';

/**
 * Confirm-password is a UI concern only, so it extends — never forks — the
 * shared domain schema, mirroring `AdminAccountStep`. The confirmation field
 * is stripped before the IPC call; the domain sees exactly
 * `ChangeAdminPasswordCredentials`.
 */
const changePasswordFormSchema = changeAdminPasswordSchema
  .extend({ confirmNewPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'password-mismatch',
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

/** Password-change section of the Settings page (SOU-31). */
export function PasswordSettings() {
  const { t } = useTranslation();
  const changePassword = useChangePassword();
  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success(t('settings.password.success'));
      form.reset();
    } catch (error) {
      const code = mapChangePasswordError(error);
      if (code === 'invalid-current-password') {
        form.setError('currentPassword', { message: code });
      } else {
        toast.error(t('settings.password.error'));
      }
    }
  });

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.password.title')}</CardTitle>
        <CardDescription>{t('settings.password.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.password.currentLabel')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.password.newLabel')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{t('settings.password.hint')}</p>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmNewPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.password.confirmLabel')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? t('settings.password.saving') : t('settings.password.submit')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
