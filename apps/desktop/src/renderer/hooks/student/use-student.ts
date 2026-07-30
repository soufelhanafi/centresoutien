import { useQuery } from '@tanstack/react-query';
import { studentsGateway } from '../../lib/students/students-gateway';
import { studentKeys } from './keys';

/** Loads a single student by id. Returns `null` when archived or not found. */
export function useStudent(id: string) {
  return useQuery({
    queryKey: studentKeys.detail(id),
    queryFn: () => studentsGateway.get(id),
    refetchOnWindowFocus: false,
  });
}
