import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
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
import { FieldMessage } from '../form/field-message';
import { withOptionalArabicName } from '../../lib/forms/optional-arabic-name';
import { holidayInputSchema } from '@centresoutien/domain';
import type { HolidayInput } from '../../lib/holidays/holiday-view';

/** The two holiday kinds — solar (recurs yearly) and lunar (entered per year). */
const HOLIDAY_KINDS = ['fixed', 'lunar'] as const;

/** Blank defaults for the create flow — a solar holiday with empty name and dates. */
export const EMPTY_HOLIDAY_INPUT: HolidayInput = {
  name: { fr: '', ar: '' },
  kind: 'fixed',
  startDate: '',
  endDate: '',
};

type HolidayFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: HolidayInput;
  onSubmit: (values: HolidayInput) => void | Promise<void>;
};

/**
 * The holiday create/edit fields — bilingual name, kind (solar/lunar), and an
 * inclusive date range — validated by the shared domain schema. Presentation
 * only: the caller owns the mutation and decides what "submit" means. The Arabic
 * name field forces its own direction and face; date/kind inputs stay LTR.
 */
export function HolidayForm({ formId, defaultValues, onSubmit }: HolidayFormProps) {
  const { t } = useTranslation();
  const form = useForm<HolidayInput>({
    resolver: withOptionalArabicName(zodResolver(holidayInputSchema)),
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
              <FormLabel>{t('holidays.form.nameFr')}</FormLabel>
              <FormControl>
                <Input lang="fr" dir="ltr" placeholder={t('holidays.form.nameFrPlaceholder')} {...field} />
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
              <FormLabel>{t('holidays.form.nameAr')}</FormLabel>
              <FormControl>
                <Input lang="ar" dir="rtl" placeholder={t('holidays.form.nameArPlaceholder')} {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('common.arabicNameOptionalHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('holidays.form.kind')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('holidays.form.kind')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {HOLIDAY_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`holidays.kind.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t(`holidays.kindHint.${field.value}`)}</p>
              <FieldMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('holidays.form.startDate')}</FormLabel>
                <FormControl>
                  <Input type="date" dir="ltr" {...field} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('holidays.form.endDate')}</FormLabel>
                <FormControl>
                  <Input type="date" dir="ltr" {...field} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}
