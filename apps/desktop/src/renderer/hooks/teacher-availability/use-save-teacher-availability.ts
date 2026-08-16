import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';
import { teacherAvailabilityKeys } from './use-teacher-availability';

/**
 * Upserts a teacher's weekly availability windows over the typed IPC bridge.
 * Main injects the envelope (centerCode, device, user); the renderer only sends
 * the teacher and the editable week. Invalidates that teacher's availability
 * cache so the tab re-reads exactly what was persisted.
 */
export function useSaveTeacherAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IpcRequest<'teacherAvailability.save'>) =>
      window.api.invoke('teacherAvailability.save', input),
    onSuccess: (_, input) =>
      queryClient.invalidateQueries({ queryKey: teacherAvailabilityKeys.detail(input.teacherId) }),
  });
}
