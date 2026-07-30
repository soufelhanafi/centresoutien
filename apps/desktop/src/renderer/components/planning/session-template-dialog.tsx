import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  KindBadge,
} from '@centresoutien/ui';
import type { PlannerSessionView } from '../../lib/planning/planner-view';

type SessionTemplateDialogProps = {
  /** The clicked session, or `null` when the dialog is closed. */
  session: PlannerSessionView | null;
  onOpenChange: (open: boolean) => void;
};

/** One labelled read-only field row in the template summary. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-end text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Session template details opened from a grid block. Read-only for now — editing
 * and creation land with the scheduling use cases (SOU-53 published the entity +
 * port but no write channel yet), so the primary action is disabled with a hint.
 */
export function SessionTemplateDialog({ session, onOpenChange }: SessionTemplateDialogProps) {
  const { t, i18n } = useTranslation();
  if (session === null) return null;

  const subject = i18n.language === 'ar' ? session.subjectName.ar : session.subjectName.fr;
  const dash = t('planning.dialog.none');

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {subject}
            <KindBadge
              kind={session.kind}
              label={t(session.kind === 'exam-prep' ? 'planning.kind.examPrep' : 'planning.kind.regular')}
            />
          </DialogTitle>
          <DialogDescription>{t('planning.dialog.subtitle')}</DialogDescription>
        </DialogHeader>

        <dl className="mt-1">
          <Field label={t('planning.dialog.day')} value={t(`planning.weekdays.${session.dayOfWeek}`)} />
          <Field label={t('planning.dialog.time')} value={`${session.start} – ${session.end}`} />
          <Field label={t('planning.dialog.teacher')} value={session.teacherName ?? dash} />
          <Field label={t('planning.dialog.room')} value={session.roomName} />
          <Field label={t('planning.dialog.level')} value={session.level} />
        </dl>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{t('planning.dialog.editComingSoon')}</p>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('planning.dialog.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
