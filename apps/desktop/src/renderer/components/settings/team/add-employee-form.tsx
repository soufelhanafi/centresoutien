import { useEffect } from 'react';
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';

/** Blank defaults for the invite flow — empty username, first invitable role. */
export const EMPTY_EMPLOYEE_INPUT: CreateUserInput = {
  username: '',
  role: INVITABLE_ROLES[0],
};

/** A server-side rejection routed to a specific field, kept as a fresh object so
 * the effect re-runs even on an identical repeat rejection (mirrors SubjectForm). */
export type EmployeeFormServerFieldError = { readonly field: 'username'; readonly code: string };

type AddEmployeeFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  onSubmit: (values: CreateUserInput) => void | Promise<void>;
  serverFieldError?: EmployeeFormServerFieldError | null;
};

/**
 * The invite-employee fields (SOU-256): a username and a role picker seeded from
 * the domain's `INVITABLE_ROLES` (secretary only today) — never a hardcoded list,
 * so re-splitting roles later stays a domain edit. Presentation only: the caller
 * owns the mutation and the one-time setup code it returns.
 */
export function AddEmployeeForm({ formId, onSubmit, serverFieldError }: AddEmployeeFormProps) {
  const { t } = useTranslation();
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserInputSchema),
    defaultValues: EMPTY_EMPLOYEE_INPUT,
  });

  const { setError } = form;
  useEffect(() => {
    if (serverFieldError) setError(serverFieldError.field, { message: serverFieldError.code });
  }, [serverFieldError, setError]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('team.form.usernameLabel')}</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  autoFocus
                  placeholder={t('team.form.usernamePlaceholder')}
                  {...field}
                  onChange={(event) => {
                    form.clearErrors('username');
                    field.onChange(event);
                  }}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

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
