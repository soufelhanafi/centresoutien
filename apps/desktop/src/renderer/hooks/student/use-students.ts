import { useQuery } from '@tanstack/react-query';
import { studentsGateway } from '../../lib/students/students-gateway';
import { studentKeys } from './keys';

/**
 * Loads the student list, filtered by `search` (FR/AR name or level). Data
 * access goes through the {@link studentsGateway} seam, not `window.api`
 * directly, so the mock adapter swaps for the real IPC one in a single place.
 */
export function useStudents(search: string) {
  return useQuery({
    queryKey: studentKeys.list(search),
    queryFn: () => studentsGateway.list({ search }),
    refetchOnWindowFocus: false,
  });
}
