import { useTranslation } from 'react-i18next';
import type { ConflictSideDto } from '../../../shared/ipc/sync-contract';

type ConflictSide = ConflictSideDto;

/** One side of a conflict — who / when / what, the popup's per-side readout. */
export function ConflictSideView({
  side,
  label,
}: {
  side: ConflictSide;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('sync.side.device')}</dt>
          <dd className="font-mono">{side.deviceId}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('sync.side.editedBy')}</dt>
          <dd className="font-mono">{side.updatedBy}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('sync.side.when')}</dt>
          <dd title={new Date(side.at).toISOString()}>{relativeTime(side.at)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('sync.side.changedFields')}</dt>
          <dd className="text-end">{side.changedFields.join(', ') || t('sync.side.none')}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Relative UTC time ("il y a 5 min"); the exact instant is on `title`. */
function relativeTime(iso: string): string {
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const mins = Math.round(diffMs / 60000);
  return formatRelative(mins);
}

function formatRelative(mins: number): string {
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} j`;
}
