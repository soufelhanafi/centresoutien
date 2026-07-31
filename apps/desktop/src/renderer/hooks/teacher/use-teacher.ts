import { useQuery } from '@tanstack/react-query';
import { teachersGateway } from '../../lib/teachers/teachers-gateway';
import { teacherKeys } from './keys';

/** Loads a single teacher by id. Returns `null` when archived or not found. */
export function useTeacher(id: string) {
  return useQuery({
    queryKey: teacherKeys.detail(id),
    queryFn: () => teachersGateway.get(id),
    refetchOnWindowFocus: false,
  });
}
