import type { PersonSearchResult } from './search-view';
import type { SearchGateway } from './search-gateway';

/** Global cap, matching the domain's top-20 merge (SOU-43 KICKOFF). */
const MAX_RESULTS = 20;

function displayKey(result: PersonSearchResult): string {
  return result.kind === 'parent' ? result.entity.name : result.entity.name.fr;
}

/**
 * Interim {@link SearchGateway} (SOU-43). The domain's dedicated `people.search`
 * channel — one merged, name-only, top-20 call — is built on the backend branch
 * but not yet merged into this UI branch's IPC contract, so this adapter fans out
 * to the three already-published list channels behind the SAME interface and
 * merges client-side. When `people.search` lands, this body collapses to a single
 * `window.api.invoke('people.search', { query })` with no change to any consumer.
 *
 * Note: the interim list channels match name-or-level (student) / name-or-phone
 * (teacher, parent); the merged domain channel is name-only. The palette contract
 * (grouped, top-20 people) is identical either way.
 */
class IpcSearchGateway implements SearchGateway {
  async searchPeople(query: string): Promise<readonly PersonSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed === '') return [];

    const [students, teachers, parents] = await Promise.all([
      window.api.invoke('student.list', { search: trimmed }),
      window.api.invoke('teacher.list', { scope: 'active', search: trimmed }),
      window.api.invoke('parent.list', { search: trimmed }),
    ]);

    const results: PersonSearchResult[] = [
      ...students.students.map((entity) => ({ kind: 'student' as const, entity })),
      ...teachers.teachers.map((entity) => ({ kind: 'teacher' as const, entity })),
      ...parents.parents.map((entity) => ({ kind: 'parent' as const, entity })),
    ];

    results.sort((a, b) => displayKey(a).localeCompare(displayKey(b)));
    return results.slice(0, MAX_RESULTS);
  }
}

export const ipcSearchGateway: SearchGateway = new IpcSearchGateway();
