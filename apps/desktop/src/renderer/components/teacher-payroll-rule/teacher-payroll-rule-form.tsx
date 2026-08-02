import type { z } from 'zod';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { teacherPayrollRuleInputSchema, type TeacherPayrollRuleInput } from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { centimesToMad, madToCentimes } from '../../lib/formulas/price-mad';
import { TeacherPayrollRuleKindField } from './teacher-payroll-rule-kind-field';

/**
 * The schema's own *input* shape (`endMonth` optional, per its `.default(null)`)
 * rather than `TeacherPayrollRuleInput` (the parsed *output*, `endMonth`
 * required) — `zodResolver` types the form's `TFieldValues` against the input
 * side, and `exactOptionalPropertyTypes` rejects the mismatch otherwise.
 */
export type TeacherPayrollRuleFormValues = z.input<typeof teacherPayrollRuleInputSchema>;

type TeacherPayrollRuleFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: TeacherPayrollRuleFormValues;
  /** Earliest selectable effective month — the month after a rule being replaced started. */
  minStartMonth?: string | undefined;
  onSubmit: (values: TeacherPayrollRuleInput) => void | Promise<void>;
};

/**
 * The payroll rule create/replace fields — kind, the kind-specific amount, and
 * the effective month — validated by the shared domain schema
 * (`teacherPayrollRuleInputSchema`, a `z.discriminatedUnion` on `kind`).
 * `teacherId` and `endMonth` are carried in `defaultValues` but never rendered:
 * a rule is always created open-ended, and closed later via the separate close
 * channel (CLAUDE.md §6 close-and-reopen). Presentation only — the caller owns
 * the mutation(s).
 */
export function TeacherPayrollRuleForm({
  formId,
  defaultValues,
  minStartMonth,
  onSubmit,
}: TeacherPayrollRuleFormProps) {
  const { t } = useTranslation();
  const form = useForm<TeacherPayrollRuleFormValues>({
    resolver: zodResolver(teacherPayrollRuleInputSchema),
    defaultValues,
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const submit = form.handleSubmit(async (values) => {
    // `minStartMonth` is a cross-field constraint (depends on the rule being
    // replaced, not on `values` alone) that the schema can't express — the
    // native `<input type="month" min>` is a UI hint only and does not block
    // a typed-in or programmatically-set value, so it's re-checked here.
    if (minStartMonth !== undefined && values.startMonth < minStartMonth) {
      form.setError('startMonth', { message: 'start-month-too-early' });
      return;
    }
    // The resolver has already parsed `values` into the schema's output shape
    // (`endMonth` defaulted to `null`) by the time this callback runs — RHF's
    // typing doesn't distinguish a resolver's input/output generics, hence the cast.
    await onSubmit(values as TeacherPayrollRuleInput);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TeacherPayrollRuleKindField control={form.control} />

        {kind === 'fixed-monthly' && (
          <FormField
            control={form.control}
            name="amountMad"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('teachers.detail.payroll.form.amount')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step={0.01}
                    dir="ltr"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isNaN(field.value) ? '' : centimesToMad(field.value)}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === '' ? Number.NaN : madToCentimes(event.target.valueAsNumber),
                      )
                    }
                  />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
        )}

        {kind === 'percentage-of-monthly-fees' && (
          <FormField
            control={form.control}
            name="percent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('teachers.detail.payroll.form.percent')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    max={100}
                    step={0.01}
                    dir="ltr"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isNaN(field.value) ? '' : field.value}
                    onChange={(event) =>
                      field.onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
                    }
                  />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="startMonth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('teachers.detail.payroll.form.startMonth')}</FormLabel>
              <FormControl>
                <Input type="month" dir="ltr" min={minStartMonth} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
