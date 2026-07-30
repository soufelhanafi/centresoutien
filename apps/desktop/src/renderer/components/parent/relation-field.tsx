import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { GUARDIAN_RELATIONS, type ParentInput } from '@centresoutien/domain';
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
import type { ParentFormInput } from './parent-form';

/** The guardian-relation dropdown. Tokens come from the domain; labels from i18n. */
export function RelationField({
  control,
}: {
  control: Control<ParentFormInput, unknown, ParentInput>;
}) {
  const { t } = useTranslation();

  return (
    <FormField
      control={control}
      name="relation"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('parents.form.relation')}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t('parents.form.relation')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {GUARDIAN_RELATIONS.map((relation) => (
                <SelectItem key={relation} value={relation}>
                  {t(`guardian.relation.${relation}`)}
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
