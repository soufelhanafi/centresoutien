/**
 * Query keys for the niveaux module. Every write hook (create/update)
 * invalidates the `all` prefix, so the form pickers, the list filters, and the
 * manage screen's usage table refetch together.
 */
export const niveauKeys = {
  all: ['niveaux'] as const,
  list: ['niveaux', 'list'] as const,
  active: ['niveaux', 'active'] as const,
  usage: ['niveaux', 'usage'] as const,
};
