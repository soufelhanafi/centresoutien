import type { z } from 'zod';
import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { centerProfileSchema, CenterProfileInput } from '@centresoutien/domain';
import { FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';

/**
 * The form's raw values. The schema's optional fields carry `.default('')`, so
 * the *input* type has optional keys while the *output* (`CenterProfileInput`)
 * is all-required — the two feed `useForm`'s value and transformed generics.
 */
export type CenterProfileFormValues = z.input<typeof centerProfileSchema>;

type CenterProfileFieldsProps = {
  control: Control<CenterProfileFormValues, unknown, CenterProfileInput>;
};

/**
 * The editable text fields of the center profile (name, address, phone, email).
 * Kept free of submit/logo chrome so both the Settings form and, later, the
 * first-run wizard step can compose it against their own footer.
 */
export function CenterProfileFields({ control }: CenterProfileFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('settings.center.nameLabel')}</FormLabel>
            <FormControl>
              <Input placeholder={t('settings.center.namePlaceholder')} {...field} />
            </FormControl>
            <FieldMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('settings.center.addressLabel')}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FieldMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('settings.center.phoneLabel')}</FormLabel>
            <FormControl>
              <Input type="tel" dir="ltr" className="text-start" {...field} />
            </FormControl>
            <FieldMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('settings.center.emailLabel')}</FormLabel>
            <FormControl>
              <Input type="email" dir="ltr" className="text-start" {...field} />
            </FormControl>
            <FieldMessage />
          </FormItem>
        )}
      />
    </>
  );
}
