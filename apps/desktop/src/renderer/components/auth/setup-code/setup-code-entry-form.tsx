import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { validateSetupCodeInputSchema } from '@centresoutien/domain';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';
import { useValidateSetupCode } from '../../../hooks/user/use-validate-setup-code';
import { mapRedeemSetupCodeError } from '../../../lib/users/redeem-setup-code-error';

type EntryValues = z.infer<typeof validateSetupCodeInputSchema>;

/**
 * Step 1 of the code-first redemption (SOU-303): the staff prove their setup code
 * alone. Validating it resolves the invite and tells the flow whether this is a
 * first onboarding (collect identity next) or a director-reissued recovery (new
 * password only). Invalid/expired codes surface on the code field.
 */
export function SetupCodeEntryForm({
  onValidated,
}: {
  onValidated: (result: { setupCode: string; needsIdentity: boolean }) => void;
}) {
  const { t } = useTranslation();
  const validate = useValidateSetupCode();
  const form = useForm<EntryValues>({
    resolver: zodResolver(validateSetupCodeInputSchema),
    defaultValues: { setupCode: '' },
  });

  const onSubmit = form.handleSubmit(async ({ setupCode }) => {
    try {
      const { needsIdentity } = await validate.mutateAsync({ setupCode });
      onValidated({ setupCode, needsIdentity });
    } catch (error) {
      const code = mapRedeemSetupCodeError(error);
      form.setError('setupCode', { message: code ?? 'setup-code-invalid' });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="setupCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.setup.code')}</FormLabel>
              <FormControl>
                <Input autoComplete="off" autoFocus dir="ltr" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('auth.setup.codeHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={validate.isPending}>
          {validate.isPending ? t('auth.setup.checking') : t('auth.setup.continue')}
        </Button>
      </form>
    </Form>
  );
}
