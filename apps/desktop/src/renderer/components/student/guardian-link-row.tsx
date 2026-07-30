import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';

/** One linked guardian: name + relation, with an inline unlink action. */
export function GuardianLinkRow({
  parent,
  onUnlink,
  disabled,
}: {
  parent: ParentView;
  onUnlink: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{parent.name}</span>
        <span className="text-xs text-muted-foreground">
          {t(`guardian.relation.${parent.relation}`)}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onUnlink}
        aria-label={t('students.guardians.unlink', { name: parent.name })}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </li>
  );
}
