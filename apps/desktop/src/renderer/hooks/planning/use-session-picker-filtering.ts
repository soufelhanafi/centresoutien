import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { usePersistedPairReconciliation } from './use-persisted-pair-reconciliation';
import type { SessionFormControl, SessionFormInput } from '../../lib/planning/session-form-schema';
import type {
  SessionFormOptions,
  SessionGroupOption,
  SessionTeacherOption,
} from '../../lib/planning/session-options';
import {
  visibleGroupsForTeacher,
  visibleTeachersForGroup,
} from '../../lib/planning/session-picker-filter';

type PickerFiltering = {
  readonly visibleTeachers: readonly SessionTeacherOption[];
  readonly visibleGroups: readonly SessionGroupOption[];
  readonly teacherCleared: boolean;
  readonly selectTeacher: (teacherId: string | null, onChange: (value: string | null) => void) => void;
  readonly selectGroup: (groupId: string | null, onChange: (value: string | null) => void) => void;
};

/** Radix Select emits this on a controlled value that matches no item, echoing a
 *  reset that is a framework artifact, never a user choice. */
const RADIX_RESET_ECHO = '';

/**
 * Drives the session form's subject-aware teacher ↔ group pickers (SOU-277). Each
 * Select renders only the subject-compatible options (visibleTeachers /
 * visibleGroups), so a fresh incompatible pair can never be assembled — no
 * clear-on-switch path is reachable. The one reachable reset is a *persisted* pair
 * that went stale before the edit drawer opened: the mount reconcile clears the
 * teacher and the derived `teacherCleared` flag raises the inline hint until the
 * user dismisses it by choosing in either picker. Lives in a hook so every
 * `SessionAssignmentFields` consumer (create dialog, template, generator) gets the
 * same behavior.
 */
export function useSessionPickerFiltering(
  control: SessionFormControl,
  options: SessionFormOptions,
): PickerFiltering {
  const { formState } = useFormContext<SessionFormInput>();
  const teacherId = useWatch({ control, name: 'teacherId' }) ?? null;
  const groupId = useWatch({ control, name: 'groupId' }) ?? null;

  const teacherClearedOnLoad = usePersistedPairReconciliation(
    options,
    formState.defaultValues?.teacherId ?? null,
    formState.defaultValues?.groupId ?? null,
  );
  const [hintDismissed, setHintDismissed] = useState(false);
  const teacherCleared = teacherClearedOnLoad && !hintDismissed;

  const visibleGroups = useMemo(
    () => visibleGroupsForTeacher(options.groups, options.teachers, teacherId),
    [options.groups, options.teachers, teacherId],
  );
  const visibleTeachers = useMemo(
    () => visibleTeachersForGroup(options.teachers, options.groups, groupId),
    [options.teachers, options.groups, groupId],
  );

  const selectTeacher = (nextTeacherId: string | null, onChange: (value: string | null) => void) => {
    if (nextTeacherId === RADIX_RESET_ECHO) return;
    onChange(nextTeacherId);
    setHintDismissed(true);
  };

  const selectGroup = (nextGroupId: string | null, onChange: (value: string | null) => void) => {
    if (nextGroupId === RADIX_RESET_ECHO) return;
    onChange(nextGroupId);
    setHintDismissed(true);
  };

  return { visibleTeachers, visibleGroups, teacherCleared, selectTeacher, selectGroup };
}
