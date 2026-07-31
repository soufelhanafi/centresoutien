import type { TeacherStatus } from '../../lib/teachers/teacher-view';

/** Query keys for the teachers module. Mutations invalidate `teacherKeys.all`. */
export const teacherKeys = {
  all: ['teachers'] as const,
  list: (status: TeacherStatus, search: string) =>
    ['teachers', 'list', status, search] as const,
  detail: (id: string) => ['teachers', 'detail', id] as const,
};
