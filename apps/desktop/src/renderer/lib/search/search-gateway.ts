import { ipcSearchGateway } from './ipc-search-gateway';
import type { PersonSearchResult } from './search-view';

/**
 * The seam the command palette depends on (Dependency Inversion). The palette
 * calls this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place.
 */
export interface SearchGateway {
  searchPeople(query: string): Promise<readonly PersonSearchResult[]>;
}

export const searchGateway: SearchGateway = ipcSearchGateway;
