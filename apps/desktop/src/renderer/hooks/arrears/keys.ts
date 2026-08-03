import type { ArrearsFilters } from '../../lib/arrears/arrears-view';

/** Query keys for the arrears (Impayés) module. Recording a payment invalidates `arrearsKeys.all`. */
export const arrearsKeys = {
  all: ['arrears'] as const,
  list: (filters: ArrearsFilters) => ['arrears', 'list', filters] as const,
};
