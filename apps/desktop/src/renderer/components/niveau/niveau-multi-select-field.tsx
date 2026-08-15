import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormContext } from 'react-hook-form';
import { Checkbox, FormField, FormItem, FormLabel, Label, Skeleton } from '@centresoutien/ui';
import { useNiveauxActive } from '../../hooks/niveau/use-niveaux-active';
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';

/** The minimal field shape the teacher form satisfies (RHF's `Control` is invariant). */
type NiveauIdsFormValue = { niveauIds?: string[] };

/**
 * Level multi-select for the teacher create/edit form (SOU-260), bound to the
 * `niveauIds` field. Reads the form methods from context; options come from
 * the level options (`niveau.list` with scope `active`). A since-deactivated level that a teacher still holds stays
 * visible (and removable) rather than being silently dropped on save. A checkbox
 * group, mirroring `TeacherSubjectsField`. Covers loading / error / empty states.
 */
export function NiveauMultiSelectField() {
  const { t, i18n } = useTranslation();
  const { control } = useFormContext<NiveauIdsFormValue>();
  const niveauxQuery = useNiveauxActive();
  const fieldId = useId();

  return (
    <FormField
      control={control}
      name="niveauIds"
      render={({ field }) => {
        const value = field.value ?? [];
        const options = (niveauxQuery.data ?? []).filter(
          (niveau) => niveau.active || value.includes(niveau.id),
        );
        const toggle = (id: string, checked: boolean) =>
          field.onChange(checked ? [...value, id] : value.filter((x) => x !== id));

        return (
          <FormItem>
            <FormLabel>{t('niveaux.field.teacherLabel')}</FormLabel>
            {niveauxQuery.isPending ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-6 w-full" />
                ))}
              </div>
            ) : niveauxQuery.isError ? (
              <p className="text-sm text-destructive">{t('niveaux.field.loadError')}</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('niveaux.field.empty')}</p>
            ) : (
              <div
                role="group"
                aria-label={t('niveaux.field.teacherLabel')}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                {options.map((niveau) => {
                  const checkboxId = `${fieldId}-${niveau.id}`;
                  return (
                    <div key={niveau.id} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={value.includes(niveau.id)}
                        onCheckedChange={(checked) => toggle(niveau.id, checked === true)}
                      />
                      <Label htmlFor={checkboxId} className="font-normal">
                        {localizedNiveauName(niveau.name, i18n.language)}
                        {!niveau.active && (
                          <span className="ms-2 text-xs text-muted-foreground">
                            {t('niveaux.field.inactive')}
                          </span>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </FormItem>
        );
      }}
    />
  );
}
