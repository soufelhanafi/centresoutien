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
import { useNiveauxAll } from '../../hooks/niveau/use-niveaux-all';
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';

/** Sentinel for the "no level yet" option — Radix Select needs a string value. */
export const NIVEAU_NONE = '__niveau_none__';

/**
 * The minimal field shape both the student and the group form satisfy, so this
 * field can live in a shared component while its host form keeps its own full
 * value type (RHF's `Control` is invariant, so a prop would not type-check
 * against either form).
 */
type NiveauIdFormValue = { niveauId?: string | null; level?: string };

/**
 * Single-level select for the student and group forms, bound to the `niveauId`
 * field (nullable — the "no level yet" option maps to `null`). The legacy
 * free-text `level` field was replaced by this picker (SOU-260), so the chosen
 * level's code (or fr name when it has no code) is mirrored into the form's
 * `level` field — keeping the backward-compatible label populated for filters
 * and tables that still read it. Reads the form methods from context.
 *
 * Options are the active levels plus the currently-assigned one even when it
 * has since been deactivated (an edit must display and manage a retained
 * assignment, not blank it out) — matching `NiveauMultiSelectField`.
 */
export function NiveauSelectField() {
  const { t, i18n } = useTranslation();
  const { control, watch, setValue } = useFormContext<NiveauIdFormValue>();
  const currentId = watch('niveauId');
  const allNiveaux = useNiveauxAll().data ?? [];
  const options = allNiveaux.filter(
    (niveau) => niveau.active || niveau.id === currentId,
  );

  return (
    <FormField
      control={control}
      name="niveauId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('niveaux.field.label')}</FormLabel>
          <Select
            value={field.value ?? NIVEAU_NONE}
            onValueChange={(value) => {
              const niveauId = value === NIVEAU_NONE ? null : value;
              field.onChange(niveauId);
              const niveau = allNiveaux.find((n) => n.id === niveauId);
              setValue('level', niveau ? (niveau.code ?? niveau.name.fr) : '');
            }}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t('niveaux.field.placeholder')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NIVEAU_NONE}>{t('niveaux.field.none')}</SelectItem>
              {options.map((niveau) => (
                <SelectItem key={niveau.id} value={niveau.id}>
                  {localizedNiveauName(niveau.name, i18n.language)}
                  {!niveau.active && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      {t('niveaux.field.inactive')}
                    </span>
                  )}
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
