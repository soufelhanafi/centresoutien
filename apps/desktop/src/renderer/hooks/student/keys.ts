/** Query keys for the students module. Mutations invalidate `studentKeys.all`. */
export const studentKeys = {
  all: ['students'] as const,
  list: (search: string) => ['students', 'list', search] as const,
  detail: (id: string) => ['students', 'detail', id] as const,
};
