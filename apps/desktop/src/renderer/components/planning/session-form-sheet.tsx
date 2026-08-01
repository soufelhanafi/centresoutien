import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@centresoutien/ui';
import { SessionForm } from './session-form';
import { SessionConflictAlert } from './session-conflict-alert';
import type { SessionFormInput, SessionFormValues } from '../../lib/planning/session-form-schema';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import type { SessionWriteErrorCode } from '../../lib/planning/session-write-error';

/** The submit-related props, bundled so the sheet stays under the prop ceiling. */
type SessionSubmission = {
  pending: boolean;
  errorCodes: readonly SessionWriteErrorCode[];
  onSubmit: (values: SessionFormValues) => void | Promise<void>;
};

type SessionFormSheetProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: SessionFormInput;
  /** Room/teacher/group picker options, or `undefined` while they load. */
  options: SessionFormOptions | undefined;
  submission: SessionSubmission;
  /** Present only in edit mode: opens the cancel (soft-delete) confirmation. */
  onCancelSession?: () => void;
};

/**
 * Presentational shell for the create/edit session drawer. Owns no mutation — the
 * flow wrapper passes `submission` and (in edit mode) `onCancelSession`. Waits for
 * the picker options before rendering the form, showing skeletons meanwhile, and
 * surfaces scheduling conflicts inline above the fields. Mirrors `GroupFormSheet`.
 */
export function SessionFormSheet({
  mode,
  open,
  onOpenChange,
  defaultValues,
  options,
  submission,
  onCancelSession,
}: SessionFormSheetProps) {
  const { t } = useTranslation();
  const formId = useId();
  const submitLabel = mode === 'create' ? t('planning.form.create') : t('planning.form.save');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('planning.form.cancel')} className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t(`planning.form.${mode}Title`)}</SheetTitle>
          <SheetDescription>{t(`planning.form.${mode}Description`)}</SheetDescription>
        </SheetHeader>

        <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <SessionConflictAlert codes={submission.errorCodes} />
          {options ? (
            <SessionForm
              formId={formId}
              defaultValues={defaultValues}
              options={options}
              onSubmit={submission.onSubmit}
            />
          ) : (
            <div className="space-y-4" aria-busy="true">
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="sm:justify-between">
          {onCancelSession ? (
            <Button type="button" variant="destructive" onClick={onCancelSession}>
              {t('planning.cancelSession.trigger')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('planning.form.cancel')}
            </Button>
            <Button type="submit" form={formId} disabled={submission.pending || !options}>
              {submission.pending ? t('planning.form.saving') : submitLabel}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
