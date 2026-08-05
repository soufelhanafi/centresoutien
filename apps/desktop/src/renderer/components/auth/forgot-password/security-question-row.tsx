import { type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  type SecurityQuestionKey,
  SECURITY_QUESTION_KEYS,
} from '@centresoutien/domain';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { FieldMessage } from '../../form/field-message';
import type { SecurityResetValues } from './security-questions-reset-form';

/**
 * One of the three question/answer rows of the security-question reset
 * (SOU-156). The question picker only offers keys not already chosen in the other
 * rows, so the three questions stay distinct without a cross-field error — the
 * admin must reproduce the exact set they configured at setup (SOU-155), which is
 * never revealed to the unauthenticated screen.
 */
export function SecurityQuestionRow({
  control,
  index,
  takenKeys,
  disabled,
}: {
  control: Control<SecurityResetValues>;
  index: number;
  takenKeys: readonly SecurityQuestionKey[];
  disabled: boolean;
}) {
  const { t } = useTranslation();

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4" disabled={disabled}>
      <FormField
        control={control}
        name={`answers.${index}.questionKey`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('auth.forgot.security.questionLabel', { number: index + 1 })}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('auth.forgot.security.questionPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {SECURITY_QUESTION_KEYS.filter(
                  (key) => key === field.value || !takenKeys.includes(key),
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`auth.forgot.questions.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`answers.${index}.answer`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('auth.forgot.security.answerLabel')}</FormLabel>
            <FormControl>
              <Input autoComplete="off" spellCheck={false} disabled={disabled} {...field} />
            </FormControl>
            <FieldMessage />
          </FormItem>
        )}
      />
    </fieldset>
  );
}
