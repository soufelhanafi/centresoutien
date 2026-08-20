import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import type { SessionFormInput } from '../../lib/planning/session-form-schema';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import { reconcilePersistedPair } from '../../lib/planning/session-picker-filter';

/**
 * Decides — and once applies — the reconciliation of a *persisted* teacher+group
 * pair that went stale before the edit drawer opened (SOU-277 AC3). The decision is
 * derived from the form's original defaults on every render, so it stays stable
 * across React StrictMode's mount → unmount → remount and the caller can drive the
 * inline hint from the returned flag. The form mutation (clearing the teacher) runs
 * once via an effect: the group's subject is the anchor, the teacher is the
 * reassignable side. Returns whether the load-time teacher was cleared.
 */
export function usePersistedPairReconciliation(
  options: SessionFormOptions,
  defaultTeacherId: string | null,
  defaultGroupId: string | null,
): boolean {
  const { setValue } = useFormContext<SessionFormInput>();
  const { clearTeacher } = reconcilePersistedPair(
    options.teachers,
    options.groups,
    defaultTeacherId,
    defaultGroupId,
  );

  // one-shot: fire only when the decision first turns true, so an async options
  // load that resolves the pair as incompatible *after* mount still clears (the
  // returned flag and the applied mutation stay the same decision), then lock so a
  // later refetch can neither re-clear the user's fresh choice nor fake the hint.
  const clearedRef = useRef(false);
  useEffect(() => {
    if (clearedRef.current || !clearTeacher) return;
    clearedRef.current = true;
    setValue('teacherId', null, { shouldValidate: true });
  }, [clearTeacher, setValue]);

  return clearTeacher;
}
