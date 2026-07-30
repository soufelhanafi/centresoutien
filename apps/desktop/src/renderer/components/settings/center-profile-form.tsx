import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { centerProfileSchema, type CenterProfileInput } from '@centresoutien/domain';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  Label,
  PlanBadge,
  toast,
} from '@centresoutien/ui';
import type { IpcResponse } from '../../../shared/ipc/contract';
import { usePlanStore } from '../../stores/plan-store';
import { useSaveCenterProfile } from '../../hooks/center/use-save-center-profile';
import { CenterProfileFields, type CenterProfileFormValues } from './center-profile-fields';
import { LogoField } from './logo-field';

/** The center as it crosses `center.get` — the single boundary source of truth. */
type CenterDto = NonNullable<IpcResponse<'center.get'>['center']>;

type CenterProfileFormProps = {
  center: CenterDto | null;
};

/**
 * The center profile form shown in Settings (SOU-28). Upserts name/address/
 * contact via `center.save`; the logo is uploaded separately and its path is
 * carried into the same save. `plan` is displayed read-only — it is seeded once
 * by the domain and never edited here.
 */
export function CenterProfileForm({ center }: CenterProfileFormProps) {
  const { t } = useTranslation();
  const activePlan = usePlanStore((state) => state.planId);
  const saveProfile = useSaveCenterProfile();
  const [logoPath, setLogoPath] = useState<string | null>(center?.logoPath ?? null);

  const form = useForm<CenterProfileFormValues, unknown, CenterProfileInput>({
    resolver: zodResolver(centerProfileSchema),
    defaultValues: {
      name: center?.name ?? '',
      address: center?.address ?? '',
      phone: center?.phone ?? '',
      email: center?.email ?? '',
    },
  });

  // Before the first save the row does not exist yet; show the active plan that
  // the domain will seed. Afterwards the canonical `center.plan` wins.
  const plan = center?.plan ?? activePlan;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveProfile.mutateAsync({ ...values, logoPath });
      toast.success(t('settings.center.saveSuccess'));
    } catch {
      toast.error(t('settings.center.saveError'));
    }
  });

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>{t('settings.center.title')}</CardTitle>
            <CardDescription>{t('settings.center.subtitle')}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Label className="text-xs text-muted-foreground">{t('settings.center.planLabel')}</Label>
            <PlanBadge tier={plan} />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <CenterProfileFields control={form.control} />
            <LogoField savedPath={logoPath} onChange={setLogoPath} />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? t('settings.center.saving') : t('settings.center.submit')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
