import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@centresoutien/ui';
import { GroupForm, type GroupFormInput } from './group-form';
import type { GroupFormOptions } from '../../lib/groups/group-view';
import type { GroupNiveauFormValues } from '../../lib/niveaux/form-schemas';

type GroupFormSheetProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: GroupFormInput;
  /** Subject/teacher picker options, or `undefined` while they load. */
  options: GroupFormOptions | undefined;
  pending: boolean;
  onSubmit: (values: GroupNiveauFormValues) => void | Promise<void>;
};

/**
 * Presentational shell for the create/edit group drawer. Owns no mutation — the
 * flow wrapper passes `onSubmit` and `pending`. Waits for the picker options
 * before rendering the form (a group can't be created without a subject),
 * showing skeletons meanwhile. Mirrors `TeacherFormSheet`.
 */
export function GroupFormSheet({
  mode,
  open,
  onOpenChange,
  defaultValues,
  options,
  pending,
  onSubmit,
}: GroupFormSheetProps) {
  const { t } = useTranslation();
  const formId = useId();
  const submitLabel = mode === 'create' ? t('groups.form.create') : t('groups.form.save');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('groups.form.cancel')} className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t(`groups.form.${mode}Title`)}</SheetTitle>
          <SheetDescription>{t(`groups.form.${mode}Description`)}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 px-1 py-4">
          {options ? (
            <GroupForm
              formId={formId}
              defaultValues={defaultValues}
              options={options}
              onSubmit={onSubmit}
            />
          ) : (
            <div className="space-y-4" aria-busy="true">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </div>
          )}
        </ScrollArea>
        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('groups.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending || !options}>
            {pending ? t('groups.form.saving') : submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
