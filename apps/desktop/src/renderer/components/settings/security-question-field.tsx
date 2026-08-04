import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SecurityQuestionKey } from '@centresoutien/domain';
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
import { FieldMessage } from '../form/field-message';
import type { SecurityQuestionsFormValues } from './security-questions-form';

type SecurityQuestionFieldProps = {
  control: Control<SecurityQuestionsFormValues>;
  index: 0 | 1 | 2;
  bank: readonly SecurityQuestionKey[];
};

/** One question-picker + answer-input row of the SOU-155 setup form. */
export function SecurityQuestionField({ control, index, bank }: SecurityQuestionFieldProps) {
  const { t } = useTranslation();
  const position = index + 1;

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <FormField
        control={control}
        name={`questions.${index}.questionKey`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('settings.securityQuestions.questionLabel', { position })}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.securityQuestions.questionPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {bank.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`settings.securityQuestions.questions.${key}`)}
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
        name={`questions.${index}.answer`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('settings.securityQuestions.answerLabel', { position })}</FormLabel>
            <FormControl>
              <Input autoComplete="off" {...field} />
            </FormControl>
            <FieldMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
