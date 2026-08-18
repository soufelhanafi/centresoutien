import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { formulaInputSchema, FORMULA_NAME_MAX, type FormulaInput } from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useFeature } from '../../hooks/use-feature';
import { centimesToMad, madToCentimes } from '../../lib/formulas/price-mad';
import { FormulaSubjectsField } from './formula-subjects-field';
import { FormulaKindField } from './formula-kind-field';

/** RHF input shape for the formula form — a direct alias of the domain's own schema. */
export type FormulaFormInput = FormulaInput;

/** Blank defaults for the create flow. `priceMad` starts `NaN` so the price box renders empty. */
export const EMPTY_FORMULA_INPUT: FormulaFormInput = {
  name: { fr: '', ar: '' },
  subjectIds: [],
  priceMad: Number.NaN,
  kind: 'regular',
};

type FormulaFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: FormulaFormInput;
  onSubmit: (values: FormulaInput) => void | Promise<void>;
};

/**
 * The formula create **and** edit fields — bilingual name, subject bundle,
 * monthly price, regular/exam-prep track — validated by the shared domain
 * schema (`formulaInputSchema`). Presentation only — the caller owns the
 * mutation. Create and edit share this one form because both write channels
 * take the identical `FormulaInput` shape (unlike Subject, whose update path
 * has its own narrower schema).
 */
export function FormulaForm({ formId, defaultValues, onSubmit }: FormulaFormProps) {
  const { t } = useTranslation();
  const examPrepEnabled = useFeature('core.exam-prep');
  const form = useForm<FormulaFormInput>({
    resolver: zodResolver(formulaInputSchema),
    defaultValues,
  });
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name.fr"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('formulas.form.nameFr')}</FormLabel>
              <FormControl>
                <Input lang="fr" dir="ltr" maxLength={FORMULA_NAME_MAX} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name.ar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('formulas.form.nameAr')}</FormLabel>
              <FormControl>
                <Input
                  lang="ar"
                  dir="rtl"
                  maxLength={FORMULA_NAME_MAX}
                  placeholder={t('common.arabicNameOptionalPlaceholder')}
                  {...field}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('common.arabicNameOptionalHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormulaSubjectsField control={form.control} />

        <FormField
          control={form.control}
          name="priceMad"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('formulas.form.price')}</FormLabel>
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
              <p className="text-xs text-muted-foreground">{t('formulas.form.priceHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        {examPrepEnabled && <FormulaKindField control={form.control} />}
      </form>
    </Form>
  );
}
