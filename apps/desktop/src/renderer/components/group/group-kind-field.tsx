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
import type { GroupFormInput } from './group-form';

/** Maps a group kind to its i18n label suffix (`exam-prep` → `examPrep`). */
const kindLabelKey = (kind: string) => (kind === 'exam-prep' ? 'examPrep' : 'regular');

/**
 * The regular / exam-prep selector. Rendered only when the plan includes
 * `core.exam-prep` (Pro+) — the caller gates it; on Essentiel the group stays
 * `regular`, matching the domain gate on `CreateGroup`.
 */
export function GroupKindField({ control }: { control: Control<GroupFormInput> }) {
  const { t } = useTranslation();

  return (
    <FormField
      control={control}
      name="kind"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('groups.form.kind')}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t('groups.form.kind')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {GROUP_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`groups.kind.${kindLabelKey(kind)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t(`groups.kindHint.${kindLabelKey(field.value)}`)}
          </p>
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}
