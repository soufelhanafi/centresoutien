import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { centerProfileSchema, type CenterProfileInput } from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  toast,
} from '@centresoutien/ui';
import { CenterProfileFields, type CenterProfileFormValues } from '../settings/center-profile-fields';
import { useCreateCenter } from '../../hooks/center/use-create-center';

type AddCenterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The add-a-center dialog (SOU-310, Premium). Reuses the shared Center Profile
 * fields to capture the new center's details, then provisions it and lands in it
 * via `useCreateCenter`. Only the profile is asked for — hours/holidays/password
 * are configured later in Settings — matching the "profile-only create" decision.
 * The domain enforces the `org.multi-center` gate, so a locked plan surfaces as the
 * mutation's error state even if this dialog were somehow reached.
 */
export function AddCenterDialog({ open, onOpenChange }: AddCenterDialogProps) {
  const { t } = useTranslation();
  const createCenter = useCreateCenter();

  const form = useForm<CenterProfileFormValues, unknown, CenterProfileInput>({
    resolver: zodResolver(centerProfileSchema),
    defaultValues: { name: '', address: '', phone: '', email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createCenter.mutateAsync(values);
      // The success reset already navigated to the new center's dashboard and
      // cleared caches; close and blank the dialog so it does not overlay the shell
      // and a later reopen starts fresh.
      onOpenChange(false);
      form.reset();
      toast.success(t('centerSwitcher.addCenter.success', { name: values.name }));
    } catch {
      toast.error(t('centerSwitcher.addCenter.error'));
    }
  });

  const requestClose = (next: boolean) => {
    if (createCenter.isPending) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('centerSwitcher.addCenter.title')}</DialogTitle>
          <DialogDescription>{t('centerSwitcher.addCenter.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <CenterProfileFields control={form.control} />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => requestClose(false)}
                disabled={createCenter.isPending}
              >
                {t('centerSwitcher.addCenter.cancel')}
              </Button>
              <Button type="submit" disabled={createCenter.isPending}>
                {createCenter.isPending
                  ? t('centerSwitcher.addCenter.submitting')
                  : t('centerSwitcher.addCenter.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
