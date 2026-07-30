/** Query keys for the parents module. Mutations invalidate `parentKeys.all`. */
export const parentKeys = {
  all: ['parents'] as const,
  list: (search: string) => ['parents', 'list', search] as const,
  detail: (id: string) => ['parents', 'detail', id] as const,
  children: (id: string) => ['parents', 'children', id] as const,
};
