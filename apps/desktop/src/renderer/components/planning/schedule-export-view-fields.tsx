import { useTranslation } from 'react-i18next';
import {
  KindBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@centresoutien/ui';
import { scheduleExportEntityOptions } from '../../lib/planning/schedule-export-options';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import type { ScheduleViewScope } from '../../lib/planning/schedule-export-options';

type ScheduleExportViewFieldsProps = {
  scope: ScheduleViewScope;
  entityId: string;
  options: SessionFormOptions;
  onScopeChange: (scope: ScheduleViewScope) => void;
  onEntityIdChange: (id: string) => void;
};

const PLACEHOLDER_KEY: Record<Exclude<ScheduleViewScope, 'full'>, string> = {
  room: 'planning.form.roomPlaceholder',
  teacher: 'planning.form.teacherPlaceholder',
  group: 'planning.form.groupPlaceholder',
};

/** Scope tabs (full grid / room / teacher / group) plus the matching entity
 *  picker, reusing the same room/teacher/group option lists and `Select` pattern
 *  as the session form's `SessionAssignmentFields` (no new picker invented). */
export function ScheduleExportViewFields({
  scope,
  entityId,
  options,
  onScopeChange,
  onEntityIdChange,
}: ScheduleExportViewFieldsProps) {
  const { t, i18n } = useTranslation();
  const entityOptions =
    scope === 'full' ? [] : scheduleExportEntityOptions(scope, options, i18n.language, t('planning.unknownSubject'));

  return (
    <div className="space-y-3">
      <Tabs value={scope} onValueChange={(value) => onScopeChange(value as ScheduleViewScope)}>
        <TabsList>
          <TabsTrigger value="full">{t('planning.export.view.full')}</TabsTrigger>
          <TabsTrigger value="room">{t('planning.export.view.room')}</TabsTrigger>
          <TabsTrigger value="teacher">{t('planning.export.view.teacher')}</TabsTrigger>
          <TabsTrigger value="group">{t('planning.export.view.group')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {scope !== 'full' && (
        <Select value={entityId} onValueChange={onEntityIdChange}>
          <SelectTrigger aria-label={t(`planning.export.view.${scope}`)}>
            <SelectValue placeholder={t(PLACEHOLDER_KEY[scope])} />
          </SelectTrigger>
          <SelectContent>
            {entityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="inline-flex items-center gap-1.5">
                  <span>{option.label}</span>
                  {option.examPrep && (
                    <KindBadge
                      kind="exam-prep"
                      label={t('planning.kind.examPrepShort')}
                      className="px-1 py-0 text-[10px]"
                    />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
