/** Query keys for the global people search (SOU-43). */
export const searchKeys = {
  all: ['search'] as const,
  people: (query: string) => ['search', 'people', query] as const,
};
