import { useTranslation } from 'react-i18next';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { localizedText } from '../../lib/planning/localized-text';
import type { SessionFormControl } from '../../lib/planning/session-form-schema';
import type { SessionFormOptions, SessionGroupOption } from '../../lib/planning/session-options';

/** Sentinel for the "unassigned" teacher/group — Radix Select needs a string value. */
export const NONE_VALUE = '__none__';

/**
 * The room / teacher / group pickers of the session form. Room is required; the
 * teacher and group pickers each add an "unassigned" option mapping to `null`
 * (both are optional per the SOU-131 contract). The group option is labelled by
 * its subject + level so the schedule reads the same language as the grid.
 */
export function SessionAssignmentFields({
  control,
  options,
}: {
  control: SessionFormControl;
  options: SessionFormOptions;
}) {
  const { t, i18n } = useTranslation();

  const groupLabel = (group: SessionGroupOption): string => {
    const subject =
      group.subjectName === null
        ? t('planning.unknownSubject')
        : localizedText(group.subjectName, i18n.language);
    const suffix = group.level === null ? '' : ` — ${group.level}`;
    const kind = group.kind === 'exam-prep' ? ` · ${t('planning.kind.examPrepShort')}` : '';
    return `${subject}${suffix}${kind}`;
  };

  return (
    <>
      <FormField
        control={control}
        name="roomId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('planning.form.room')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('planning.form.roomPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="teacherId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('planning.form.teacher')}</FormLabel>
            <Select
              value={field.value ?? NONE_VALUE}
              onValueChange={(value) => field.onChange(value === NONE_VALUE ? null : value)}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('planning.form.teacherPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>{t('planning.form.teacherNone')}</SelectItem>
                {options.teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {localizedText(teacher.name, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="groupId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('planning.form.group')}</FormLabel>
            <Select
              value={field.value ?? NONE_VALUE}
              onValueChange={(value) => field.onChange(value === NONE_VALUE ? null : value)}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('planning.form.groupPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>{t('planning.form.groupNone')}</SelectItem>
                {options.groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {groupLabel(group)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage />
          </FormItem>
        )}
      />
    </>
  );
}
