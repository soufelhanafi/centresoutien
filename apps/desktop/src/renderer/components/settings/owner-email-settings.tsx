import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  Skeleton,
  toast,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useOwnerEmail } from '../../hooks/settings/use-owner-email';
import { useSetOwnerEmail } from '../../hooks/settings/use-set-owner-email';
import { mapOwnerEmailError } from '../../lib/settings/owner-email-error';

/**
 * Client-side format check for good UX only — an empty field is allowed (it
 * clears the stored address). The domain Email VO re-validates + normalizes the
 * canonical value server-side.
 */
const ownerEmailFormSchema = z.object({
  email: z.union([z.literal(''), z.string().email({ message: 'invalid-email' })]),
});

type OwnerEmailFormValues = z.infer<typeof ownerEmailFormSchema>;

/**
 * Owner contact-email section of the Settings page's security tab (SOU-273).
 * The address the online password-reset relay mails a code to — a sibling of the
 * security questions, both being account-recovery mechanisms. Submitting an empty
 * field clears the stored address.
 */
export function OwnerEmailSettings() {
  const { t } = useTranslation();
  const emailQuery = useOwnerEmail();
  const setEmail = useSetOwnerEmail();
  const form = useForm<OwnerEmailFormValues>({
    resolver: zodResolver(ownerEmailFormSchema),
    defaultValues: { email: '' },
  });

  const loadedEmail = emailQuery.data?.email ?? null;
  const { reset } = form;
  useEffect(() => {
    if (emailQuery.isSuccess) reset({ email: loadedEmail ?? '' });
  }, [emailQuery.isSuccess, loadedEmail, reset]);

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const trimmed = email.trim();
    try {
      await setEmail.mutateAsync({ email: trimmed === '' ? null : trimmed });
      toast.success(trimmed === '' ? t('settings.ownerEmail.cleared') : t('settings.ownerEmail.success'));
    } catch (error) {
      const code = mapOwnerEmailError(error);
      if (code === 'invalid-email') {
        form.setError('email', { message: code });
      } else {
        toast.error(t('settings.ownerEmail.error'));
      }
    }
  });

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.ownerEmail.title')}</CardTitle>
        <CardDescription>{t('settings.ownerEmail.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {emailQuery.isPending && <Skeleton className="h-10 w-full" />}

        {emailQuery.isError && (
          <ErrorState
            icon={<Mail className="h-5 w-5" aria-hidden="true" />}
            title={t('settings.ownerEmail.loadErrorTitle')}
            description={t('settings.ownerEmail.loadErrorBody')}
            action={
              <Button variant="outline" size="sm" onClick={() => void emailQuery.refetch()}>
                {t('settings.ownerEmail.retry')}
              </Button>
            }
          />
        )}

        {emailQuery.isSuccess && (
          <Form {...form}>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.ownerEmail.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder={t('settings.ownerEmail.placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t('settings.ownerEmail.hint')}</p>
                    <FieldMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={setEmail.isPending}>
                  {setEmail.isPending ? t('settings.ownerEmail.saving') : t('settings.ownerEmail.save')}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
