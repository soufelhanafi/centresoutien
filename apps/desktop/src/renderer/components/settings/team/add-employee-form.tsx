import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { createUserInputSchema, INVITABLE_ROLES, type CreateUserInput } from '@centresoutien/domain';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';

/** Blank defaults for the invite flow — first invitable role, no identity fields. */
export const EMPTY_EMPLOYEE_INPUT: CreateUserInput = {
  role: INVITABLE_ROLES[0],
};

type AddEmployeeFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  onSubmit: (values: CreateUserInput) => void | Promise<void>;
};

/**
 * The invite-employee fields (SOU-303, code-first): a role picker only, seeded
 * from the domain's `INVITABLE_ROLES` (secretary only today) — never a hardcoded
 * list, so re-splitting roles later stays a domain edit. The director no longer
 * types a username/full name/email: the invited staff choose their own identity
 * when they redeem the code. Presentation only — the caller owns the mutation and
 * the one-time setup code it returns.
 */
export function AddEmployeeForm({ formId, onSubmit }: AddEmployeeFormProps) {
  const { t } = useTranslation();
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserInputSchema),
    defaultValues: EMPTY_EMPLOYEE_INPUT,
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('team.form.roleLabel')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('team.form.roleLabel')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INVITABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`team.roles.${role}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('team.form.roleHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
