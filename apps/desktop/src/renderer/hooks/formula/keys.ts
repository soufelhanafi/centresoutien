import type { FormulaScope } from '../../lib/formulas/formula-view';

/**
 * Query keys for the formulas module. Every write hook (create/update/clone/
 * deactivate) invalidates the `all` prefix, so both name-resolution lists and
 * the SOU-62 CRUD table refetch together. Mirrors `subjectKeys`.
 */
export const formulaKeys = {
  all: ['formulas'] as const,
  list: (scope: FormulaScope) => ['formulas', 'list', scope] as const,
};
