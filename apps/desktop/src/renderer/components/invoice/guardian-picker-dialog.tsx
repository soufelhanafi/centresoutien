import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@centresoutien/ui';
import { useParents } from '../../hooks/parent/use-parents';

// Guardian resolution UX for a student with more than one responsible (SOU-284):
// lists the linked guardians by name + relation so the user picks who the Facture
// groupée is addressed to. One click fires; the caller runs the pending print/export
// against the chosen `parentId`. The parent list is fetched only once the dialog is
// open (`enabled: isOpen`), and load failure / an empty resolved set each show their
// own state instead of a blank body.
export function GuardianPickerDialog({
  guardianIds,
  isOpen,
  onOpenChange,
  onPick,
}: {
  guardianIds: readonly string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPick: (parentId: string) => void;
}) {
  const { t } = useTranslation();
  const parentsQuery = useParents('', { enabled: isOpen });

  const guardians = useMemo(() => {
    const guardianIdSet = new Set(guardianIds);
    return (parentsQuery.data ?? []).filter((parent) => guardianIdSet.has(parent.id));
  }, [parentsQuery.data, guardianIds]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('invoices.factureGroupee.picker.title')}</DialogTitle>
          <DialogDescription>{t('invoices.factureGroupee.picker.body')}</DialogDescription>
        </DialogHeader>
        <GuardianPickerBody query={parentsQuery} guardians={guardians} onPick={onPick} />
      </DialogContent>
    </Dialog>
  );
}

type ParentOption = { id: string; name: string; relation: string };

function GuardianPickerBody({
  query,
  guardians,
  onPick,
}: {
  query: ReturnType<typeof useParents>;
  guardians: readonly ParentOption[];
  onPick: (parentId: string) => void;
}) {
  const { t } = useTranslation();

  if (query.isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('invoices.factureGroupee.picker.error')}</p>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          {t('invoices.factureGroupee.picker.retry')}
        </Button>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (guardians.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('invoices.factureGroupee.picker.empty')}</p>;
  }

  return (
    <ul className="space-y-2">
      {guardians.map((guardian) => (
        <li key={guardian.id}>
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start py-2 text-start"
            onClick={() => onPick(guardian.id)}
          >
            <span className="flex flex-col items-start">
              <span className="font-medium text-foreground">{guardian.name}</span>
              <span className="text-xs text-muted-foreground">
                {t(`guardian.relation.${guardian.relation}`)}
              </span>
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
