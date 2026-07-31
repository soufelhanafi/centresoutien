import { useQuery } from '@tanstack/react-query';
import type { TeacherStatus } from '../../lib/teachers/teacher-view';
import { teachersGateway } from '../../lib/teachers/teachers-gateway';
import { teacherKeys } from './keys';

/**
 * Loads the teacher list for one lifecycle state — `active` (default list) or
 * `archived` (restore view) — filtered by `search` (FR/AR name or phone). Data
 * access goes through the {@link teachersGateway} seam, not `window.api` directly,
 * so the adapter is swappable in a single place.
 */
export function useTeachers(status: TeacherStatus, search: string) {
  return useQuery({
    queryKey: teacherKeys.list(status, search),
    queryFn: () => teachersGateway.list({ status, search }),
    refetchOnWindowFocus: false,
  });
}
