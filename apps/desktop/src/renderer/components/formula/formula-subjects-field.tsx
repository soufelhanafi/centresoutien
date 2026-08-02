import { useId } from 'react';
import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Checkbox, FormField, FormItem, FormLabel, Label, Skeleton } from '@centresoutien/ui';
import { useSubjects } from '../../hooks/subject/use-subjects';
import { localizedSubjectName } from '../../lib/subjects/localized-name';
import type { FormulaFormInput } from './formula-form';

/**
 * Subject multi-select for the formula create/edit form, bound to the
 * `subjectIds` field — mirrors `TeacherSubjectsField`. Options come from
 * `subject.list` scope `all` so an existing bundle referencing a
 * since-deactivated subject stays visible (and can be kept or removed) rather
 * than silently dropped on save; new-assignable options are the active ones.
 * Covers loading / error / empty states.
 */
export function FormulaSubjectsField({ control }: { control: Control<FormulaFormInput> }) {
  const { t, i18n } = useTranslation();
  const query = useSubjects('all');
  const fieldId = useId();

  return (
    <FormField
      control={control}
      name="subjectIds"
      render={({ field }) => {
        const value = field.value ?? [];
        const options = (query.data ?? []).filter(
          (subject) => subject.active || value.includes(subject.id),
        );
        const toggle = (id: string, checked: boolean) =>
          field.onChange(checked ? [...value, id] : value.filter((x) => x !== id));

        return (
          <FormItem>
            <FormLabel>{t('formulas.form.subjects')}</FormLabel>
            {query.isPending ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-6 w-full" />
                ))}
              </div>
            ) : query.isError ? (
              <p className="text-sm text-destructive">{t('formulas.form.subjectsError')}</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('formulas.form.subjectsEmpty')}</p>
            ) : (
              <div
                role="group"
                aria-label={t('formulas.form.subjects')}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                {options.map((subject) => {
                  const checkboxId = `${fieldId}-${subject.id}`;
                  return (
                    <div key={subject.id} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={value.includes(subject.id)}
                        onCheckedChange={(checked) => toggle(subject.id, checked === true)}
                      />
                      <Label htmlFor={checkboxId} className="font-normal">
                        {localizedSubjectName(subject.name, i18n.language)}
                        {!subject.active && (
                          <span className="ms-2 text-xs text-muted-foreground">
                            {t('formulas.form.subjectInactive')}
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
