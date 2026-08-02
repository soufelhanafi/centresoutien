import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { GROUP_KINDS } from '@centresoutien/domain';
import {
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
import { FieldMessage } from '../form/field-message';
import type { FormulaFormInput } from './formula-form';

/** Maps a formula kind to its i18n label suffix (`exam-prep` → `examPrep`). */
const kindLabelKey = (kind: string) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/**
 * The regular / exam-prep selector, mirroring `GroupKindField`. Rendered only
 * when the plan includes `core.exam-prep` (Pro+) — the caller gates it; on
 * Essentiel a formula stays `regular`, matching the domain gate on
 * `CreateFormula`/`UpdateFormula`.
 */
export function FormulaKindField({ control }: { control: Control<FormulaFormInput> }) {
  const { t } = useTranslation();

  return (
    <FormField
      control={control}
      name="kind"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('formulas.form.kind')}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t('formulas.form.kind')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {GROUP_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`formulas.kind.${kindLabelKey(kind)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}
