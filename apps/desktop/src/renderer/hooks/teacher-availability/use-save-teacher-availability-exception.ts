import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';
import { teacherAvailabilityKeys } from './use-teacher-availability';

/**
 * Creates (or, with an `id`, edits) one one-off teacher absence over the typed
 * IPC bridge, then invalidates that teacher's availability cache.
 */
export function useSaveTeacherAvailabilityException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IpcRequest<'teacherAvailabilityException.save'>) =>
      window.api.invoke('teacherAvailabilityException.save', input),
    onSuccess: (_, input) =>
      queryClient.invalidateQueries({ queryKey: teacherAvailabilityKeys.detail(input.teacherId) }),
  });
}
