import { useTranslation } from 'react-i18next';
import { FormMessage, useFormField } from '@centresoutien/ui';

/**
 * Renders the active field's validation error, translated into the current
 * locale. The shared `FormMessage` is i18n-agnostic; this desktop wrapper reads
 * the RHF error *code* (e.g. 'required') and resolves it via `errors.*` keys.
 * Use it inside a `<FormItem>` in place of the raw `<FormMessage />`.
 */
export function FieldMessage() {
  const { t } = useTranslation();
  const { error } = useFormField();
  if (!error) return null;
  const code = String(error.message ?? '');
  return <FormMessage>{t(`errors.${code}`)}</FormMessage>;
}
