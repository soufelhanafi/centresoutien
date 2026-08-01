import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { SessionWriteErrorCode } from '../../lib/planning/session-write-error';

/**
 * Inline scheduling-conflict alert (the add-session drawer pattern): renders one
 * localized line per error code the domain raised on submit — room/teacher clash,
 * outside center hours, malformed time, invalid validity range, or a vanished
 * session — instead of a toast, so the user can fix the slot in place. Each line
 * is `t(\`errors.${code}\`)`; the structured fields never cross IPC. Renders
 * nothing when there is no error.
 */
export function SessionConflictAlert({ codes }: { codes: readonly SessionWriteErrorCode[] }) {
  const { t } = useTranslation();
  if (codes.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{t('planning.conflict.title')}</p>
        <ul className="space-y-0.5">
          {codes.map((code) => (
            <li key={code}>{t(`errors.${code}`)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
