import type { PersonSearchResult } from './search-view';
import type { SearchGateway } from './search-gateway';

/**
 * {@link SearchGateway} backed by the domain's dedicated `people.search` channel
 * (SOU-43): one merged, name-only, top-20 call gated per entity kind by
 * `core.students` / `core.teachers` / `core.parents`.
 */
class IpcSearchGateway implements SearchGateway {
  async searchPeople(query: string): Promise<readonly PersonSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed === '') return [];

    const { results } = await window.api.invoke('people.search', { query: trimmed });
    return results.map((result) => ({ kind: result.kind, entity: result.person }) as PersonSearchResult);
  }
}

export const ipcSearchGateway: SearchGateway = new IpcSearchGateway();
