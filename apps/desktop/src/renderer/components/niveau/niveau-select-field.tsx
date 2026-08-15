import { useTranslation } from 'react-i18next';
import { useFormContext } from 'react-hook-form';
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
import { useNiveauxActive } from '../../hooks/niveau/use-niveaux-active';
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';

/** Sentinel for the "no level yet" option — Radix Select needs a string value. */
export const NIVEAU_NONE = '__niveau_none__';

/**
 * The minimal field shape both the student and the group form satisfy, so this
 * field can live in a shared component while its host form keeps its own full
 * value type (RHF's `Control` is invariant, so a prop would not type-check
 * against either form).
 */
type NiveauIdFormValue = { niveauId?: string | null };

/**
 * Single-level select for the student and group forms, bound to the `niveauId`
 * field (nullable — the "no level yet" option maps to `null`). Reads the form
 * methods from context (the `Form` wrapper is a `FormProvider`); options come
 * from `niveau.listActive`.
 */
export function NiveauSelectField() {
  const { t, i18n } = useTranslation();
  const { control } = useFormContext<NiveauIdFormValue>();
  const niveaux = useNiveauxActive().data ?? [];

  return (
    <FormField
      control={control}
      name="niveauId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('niveaux.field.label')}</FormLabel>
          <Select
            value={field.value ?? NIVEAU_NONE}
            onValueChange={(value) => field.onChange(value === NIVEAU_NONE ? null : value)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t('niveaux.field.placeholder')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NIVEAU_NONE}>{t('niveaux.field.none')}</SelectItem>
              {niveaux.map((niveau) => (
                <SelectItem key={niveau.id} value={niveau.id}>
                  {localizedNiveauName(niveau.name, i18n.language)}
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
