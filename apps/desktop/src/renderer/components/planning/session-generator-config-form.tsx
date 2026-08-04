import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Form } from '@centresoutien/ui';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import {
  generatorFormSchema,
  type GeneratorFormValues,
} from '../../lib/planning/session-generator-schema';
import type { GeneratorErrorCode } from '../../lib/planning/session-generator-error';
import { GeneratorScopeFields } from './generator-scope-fields';
import { GeneratorPatternFields } from './generator-pattern-fields';
import { GeneratorRangeFields } from './generator-range-fields';

/**
 * The config step of the auto-session-generator popup (SOU-159), validated by
 * {@link generatorFormSchema}. Presentation only — the dialog owns the preview
 * mutation and passes `onSubmit` (which runs the dry run) and any `errorCode`
 * from a rejected preview (an infeasible config or a center with no rooms) to
 * surface inline above the fields. The submit button lives in the dialog footer
 * via `formId`, mirroring `SessionFormSheet`.
 */
export function SessionGeneratorConfigForm({
  formId,
  options,
  defaultValues,
  onSubmit,
  errorCode,
}: {
  formId: string;
  options: SessionFormOptions;
  defaultValues: GeneratorFormValues;
  onSubmit: (values: GeneratorFormValues) => void | Promise<void>;
  errorCode: GeneratorErrorCode | null;
}) {
  const { t } = useTranslation();
  const form = useForm<GeneratorFormValues>({ resolver: zodResolver(generatorFormSchema), defaultValues });
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {errorCode ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {t(`errors.${errorCode}`)}
          </p>
        ) : null}
        <GeneratorScopeFields control={form.control} options={options} />
        <GeneratorPatternFields control={form.control} />
        <GeneratorRangeFields control={form.control} />
      </form>
    </Form>
  );
}
