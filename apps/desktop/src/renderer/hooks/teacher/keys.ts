/** Query keys for the teachers module. Mutations invalidate `teacherKeys.all`. */
export const teacherKeys = {
  all: ['teachers'] as const,
  list: (search: string) => ['teachers', 'list', search] as const,
  detail: (id: string) => ['teachers', 'detail', id] as const,
};
