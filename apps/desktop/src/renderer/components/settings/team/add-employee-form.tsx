import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
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

// Confirm-password is a UI concern that extends — never forks — the shared domain
// schema; the confirmation field is stripped before submit so the caller sees
// exactly `CreateUserInput`.
const employeeFormSchema = createUserInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password-mismatch',
  });

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

/** Blank defaults: first invitable role, empty credentials. */
const EMPTY_EMPLOYEE_FORM: EmployeeFormValues = {
  role: INVITABLE_ROLES[0],
  username: '',
  password: '',
  confirmPassword: '',
  fullName: '',
};

type AddEmployeeFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  onSubmit: (values: CreateUserInput) => void | Promise<void>;
};

/**
 * The add-employee fields (single-laptop model): the director sets the new user's
 * login username + password directly, names them optionally, and picks a role —
 * seeded from the domain's `INVITABLE_ROLES` (secretary only today), never a
 * hardcoded list. The account is created active, so the employee signs in with
 * these credentials with no code to redeem. Presentation only — the caller owns the
 * mutation. A taken username is surfaced back onto the username field by the caller.
 */
export function AddEmployeeForm({ formId, onSubmit }: AddEmployeeFormProps) {
  const { t } = useTranslation();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: EMPTY_EMPLOYEE_FORM,
  });

  const submit = form.handleSubmit(async ({ role, username, password, fullName }) => {
    await onSubmit({ role, username, password, fullName });
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('team.form.fullNameLabel')}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
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
              <FormLabel>{t('team.form.usernameLabel')}</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
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
              <FormLabel>{t('team.form.passwordLabel')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('team.form.passwordHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('team.form.confirmPasswordLabel')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
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
