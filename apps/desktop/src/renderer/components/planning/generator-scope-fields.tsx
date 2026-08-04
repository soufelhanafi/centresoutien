import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useController, useWatch, type FieldPath } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { localizedText } from '../../lib/planning/localized-text';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import type { GeneratorFormControl, GeneratorFormValues } from '../../lib/planning/session-generator-schema';
import { GeneratorScopePicker, type ScopeOption } from './generator-scope-picker';

/**
 * The "who to generate for" section of the config popup: the run's `kind`
 * (regular / exam-prep — never mixed, CLAUDE.md §7) plus the group and teacher
 * scope pickers. Group options are filtered to the selected `kind` so the admin
 * never picks an exam-prep group for a regular run. Each scope picker maps to the
 * domain's `'all' | Id[]` union via its boolean + id-list field pair.
 */
export function GeneratorScopeFields({
  control,
  options,
}: {
  control: GeneratorFormControl;
  options: SessionFormOptions;
}) {
  const { t, i18n } = useTranslation();
  const kind = useWatch({ control, name: 'kind' });
  const locale = i18n.language;

  const groupOptions = useMemo<ScopeOption[]>(
    () =>
      options.groups
        .filter((group) => group.kind === kind)
        .map((group) => ({
          id: group.id,
          label: `${group.subjectName === null ? t('planning.unknownSubject') : localizedText(group.subjectName, locale)}${
            group.level === null ? '' : ` — ${group.level}`
          }`,
        })),
    [options.groups, kind, locale, t],
  );

  const teacherOptions = useMemo<ScopeOption[]>(
    () => options.teachers.map((teacher) => ({ id: teacher.id, label: localizedText(teacher.name, locale) })),
    [options.teachers, locale],
  );

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="kind"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('planning.generator.kind.label')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="regular">{t('planning.kind.regular')}</SelectItem>
                <SelectItem value="exam-prep">{t('planning.kind.examPrep')}</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />

      <ScopeField
        control={control}
        allName="scopeGroupsAll"
        idsName="scopeGroupIds"
        options={groupOptions}
        label={t('planning.generator.scope.groups')}
        allLabel={t('planning.generator.scope.allGroups')}
        emptyLabel={t('planning.generator.scope.noGroups')}
      />
      <ScopeField
        control={control}
        allName="scopeTeachersAll"
        idsName="scopeTeacherIds"
        options={teacherOptions}
        label={t('planning.generator.scope.teachers')}
        allLabel={t('planning.generator.scope.allTeachers')}
        emptyLabel={t('planning.generator.scope.noTeachers')}
      />
    </div>
  );
}

/** One scope picker bound to its boolean + id-list field pair, with the pair's validation error. */
function ScopeField({
  control,
  allName,
  idsName,
  options,
  label,
  allLabel,
  emptyLabel,
}: {
  control: GeneratorFormControl;
  allName: Extract<FieldPath<GeneratorFormValues>, 'scopeGroupsAll' | 'scopeTeachersAll'>;
  idsName: Extract<FieldPath<GeneratorFormValues>, 'scopeGroupIds' | 'scopeTeacherIds'>;
  options: readonly ScopeOption[];
  label: string;
  allLabel: string;
  emptyLabel: string;
}) {
  const { t } = useTranslation();
  const all = useController({ control, name: allName });
  const ids = useController({ control, name: idsName });
  const errorCode = ids.fieldState.error?.message;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <GeneratorScopePicker
        allValue={all.field.value as boolean}
        onAllChange={all.field.onChange}
        selectedIds={ids.field.value as readonly string[]}
        onSelectedChange={ids.field.onChange}
        options={options}
        allLabel={allLabel}
        emptyLabel={emptyLabel}
      />
      {!all.field.value && errorCode ? (
        <p className="text-sm font-medium text-destructive">{t(`errors.${errorCode}`)}</p>
      ) : null}
    </div>
  );
}
