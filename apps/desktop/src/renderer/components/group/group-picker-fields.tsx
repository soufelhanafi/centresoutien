import type { Control } from 'react-hook-form';
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
import { localizedName } from '../../lib/groups/localized-name';
import type { GroupFormOptions } from '../../lib/groups/group-view';
import type { GroupFormInput } from './group-form';

/** Sentinel for the "unassigned" teacher — Radix Select needs a string value. */
export const TEACHER_NONE = '__none__';

/**
 * The subject / room / teacher pickers of the group form, driven by the loaded
 * {@link GroupFormOptions}. Split out of `group-form.tsx` to keep each file under
 * the size ceiling. The teacher select adds an "unassigned" option that maps to
 * `null`; subject and room are required (validated by `groupInputSchema`).
 */
export function GroupPickerFields({
  control,
  options,
}: {
  control: Control<GroupFormInput>;
  options: GroupFormOptions;
}) {
  const { t, i18n } = useTranslation();

  return (
    <>
      <FormField
        control={control}
        name="subjectId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('groups.form.subject')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('groups.form.subjectPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {localizedName(subject.name, i18n.language)}
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
        name="roomId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('groups.form.room')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('groups.form.roomPlaceholder')} />
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
            <FormLabel>{t('groups.form.teacher')}</FormLabel>
            <Select
              value={field.value ?? TEACHER_NONE}
              onValueChange={(value) => field.onChange(value === TEACHER_NONE ? null : value)}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('groups.form.teacherPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={TEACHER_NONE}>{t('groups.form.teacherNone')}</SelectItem>
                {options.teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {localizedName(teacher.name, i18n.language)}
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
