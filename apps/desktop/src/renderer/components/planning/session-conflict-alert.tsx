import { useTranslation } from 'react-i18next';
import { AlertTriangle, TriangleAlert } from 'lucide-react';
import { cn } from '@centresoutien/ui';
import type { SessionWriteConflict } from '../../lib/planning/session-write-error';

/** The localized line for one classified conflict. */
function conflictLine(
  conflict: SessionWriteConflict,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (conflict.severity === 'error') return t(`errors.${conflict.code}`);
  return conflict.reason === null
    ? t('planning.conflict.teacherAvailability.generic')
    : t(`planning.conflict.teacherAvailability.${conflict.reason}`);
}

/**
 * Inline scheduling-conflict alert (the add-session drawer pattern, SOU-283):
 * renders one localized line per classified conflict the domain raised on submit.
 * Hard `error` conflicts (room/teacher clash, outside hours, malformed time …)
 * render in the destructive treatment; a forceable teacher-availability `warning`
 * renders in the amber treatment used by the generator warnings, and the footer's
 * force button lets the admin push it through. When every conflict is a warning
 * the whole block is amber; a single blocking error makes it destructive. Renders
 * nothing when there is no conflict.
 */
export function SessionConflictAlert({ conflicts }: { conflicts: readonly SessionWriteConflict[] }) {
  const { t } = useTranslation();
  if (conflicts.length === 0) return null;

  const hasBlockingError = conflicts.some((conflict) => conflict.severity === 'error');
  const Icon = hasBlockingError ? AlertTriangle : TriangleAlert;

  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-lg border p-3 text-sm',
        hasBlockingError
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">
          {t(hasBlockingError ? 'planning.conflict.title' : 'planning.conflict.warningTitle')}
        </p>
        <ul className="space-y-0.5">
          {conflicts.map((conflict, index) => (
            <li key={index}>{conflictLine(conflict, t)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
