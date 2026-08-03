import { ipcSearchGateway } from './ipc-search-gateway';
import type { PersonSearchResult } from './search-view';

/**
 * The seam the command palette depends on (Dependency Inversion). The palette
 * calls this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place.
 *
 * ## Contract status (SOU-43 frontend ↔ domain)
 *
 * The domain published a single `people.search` channel (name-only FR/AR match,
 * merged, top-20). It is not merged into this branch's IPC contract yet, so this
 * ships against the interim {@link ipcSearchGateway} that fans out to the existing
 * `student.list` / `teacher.list` / `parent.list` channels. Swapping to the merged
 * channel is a one-file change with no palette change.
 */
export interface SearchGateway {
  searchPeople(query: string): Promise<readonly PersonSearchResult[]>;
}

/** The active gateway: the interim fan-out adapter. Swapping it is this one line. */
export const searchGateway: SearchGateway = ipcSearchGateway;
