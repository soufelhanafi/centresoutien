import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { centerProfileSchema, type CenterProfileInput } from '@centresoutien/domain';
import { Button, Form } from '@centresoutien/ui';
import type { IpcResponse } from '../../../../shared/ipc/contract';
import { CenterProfileFields, type CenterProfileFormValues } from '../../settings/center-profile-fields';
import { LogoField } from '../../settings/logo-field';
import { WizardFooter } from '../wizard-footer';
import { useWizardNav } from '../../../hooks/wizard/use-wizard-nav';
import { useCenterProfile } from '../../../hooks/center/use-center-profile';
import { useSaveCenterProfile } from '../../../hooks/center/use-save-center-profile';

/** The center as it crosses `center.get` — the single boundary source of truth. */
type CenterDto = NonNullable<IpcResponse<'center.get'>['center']>;

/**
 * Center Profile — a mandatory, non-skippable first-run step (SOU-25 / SOU-111).
 *
 * It renders the shared SOU-28 profile form, blocks Next until the schema is
 * satisfied (name required, phone valid E.164), and persists the `center` row via
 * the existing `save-center-profile` use case so a center exists before the wizard
 * finishes. The saved row is loaded up front so returning to the step via Back
 * re-shows what was entered; re-submitting is a harmless idempotent upsert.
 */
export function CenterProfileStep() {
  const { t } = useTranslation();
  const profile = useCenterProfile();

  if (profile.isPending) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-label={t('wizard.centerProfile.loading')} />
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="flex flex-col items-start gap-3 py-4">
        <p role="alert" className="text-sm text-destructive">
          {t('wizard.centerProfile.loadError')}
        </p>
        <Button type="button" variant="outline" onClick={() => profile.refetch()}>
          {t('wizard.centerProfile.retry')}
        </Button>
      </div>
    );
  }

  return <CenterProfileStepForm center={profile.data.center} />;
}

/**
 * The form body, seeded from the (possibly null) saved center. Kept separate so
 * the query gate above stays render-only and the form mounts with its defaults
 * already resolved.
 */
function CenterProfileStepForm({ center }: { center: CenterDto | null }) {
  const { t } = useTranslation();
  const { back, submit, canGoBack } = useWizardNav();
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

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveProfile.mutateAsync({ ...values, logoPath });
      submit();
    } catch {
      // saveProfile.isError renders the alert banner below; nothing else to do here.
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <CenterProfileFields control={form.control} />
        <LogoField savedPath={logoPath} onChange={setLogoPath} />

        {saveProfile.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('wizard.centerProfile.saveError')}
          </p>
        ) : null}

        <WizardFooter
          onBack={back}
          canGoBack={canGoBack}
          nextType="submit"
          nextLabel={t('wizard.next')}
          nextPending={saveProfile.isPending}
        />
      </form>
    </Form>
  );
}
