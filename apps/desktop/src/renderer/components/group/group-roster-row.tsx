import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { BilingualText, Button } from '@centresoutien/ui';
import type { RosterEntry } from '../../lib/groups/group-view';

/** One enrolled student in the roster: bilingual name, level, remove action. */
export function GroupRosterRow({
  entry,
  onRemove,
  disabled,
}: {
  entry: RosterEntry;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {entry.studentName.fr}
        </span>
        <BilingualText
          value={entry.studentName.ar}
          script="arabic"
          className="block truncate text-xs text-muted-foreground"
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{entry.level}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('groups.roster.remove')}
          disabled={disabled}
          onClick={onRemove}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
