import type { ListStudents } from './list-students';
import type { ListTeachers } from './list-teachers';
import type { ListParents } from './list-parents';
import type { CenterCode } from '../value-objects/ids';
import type { Student } from '../entities/student';
import type { Teacher } from '../entities/teacher';
import type { Parent } from '../entities/parent';
import { PlanFeatureUnavailableError } from '../errors/plan-errors';

export type SearchPeopleInput = {
  centerCode: CenterCode;
  /** Accent/case-insensitive substring, matched against FR/AR name only (no phone or level). Empty = none. */
  query: string;
};

export type PersonSearchResult =
  | { kind: 'student'; entity: Student }
  | { kind: 'teacher'; entity: Teacher }
  | { kind: 'parent'; entity: Parent };

const RESULT_CAP = 20;

// Combining diacritical marks occupy U+0300–U+036F; dropping them folds "École"
// to "ecole". Done by codepoint rather than a regex character class so no
// combining mark ever appears in source (which would trip
// `no-misleading-character-class`). Mirrors `ListStudents` / `ListTeachers` /
// `ListParents`.
const COMBINING_LO = 0x300;
const COMBINING_HI = 0x36f;

function isCombiningMark(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= COMBINING_LO && code <= COMBINING_HI;
}

/** Fold accents + case for search comparison. */
function fold(value: string): string {
  return [...value.normalize('NFKD')]
    .filter((ch) => !isCombiningMark(ch))
    .join('')
    .toLowerCase();
}

function matchesName(names: readonly string[], needle: string): boolean {
  return needle !== '' && names.some((name) => fold(name).includes(needle));
}

function nameOf(result: PersonSearchResult): string {
  return result.kind === 'parent' ? result.entity.name : result.entity.name.fr;
}

/**
 * Searches a center's teachers, students, and parents by FR/AR name for the
 * global command palette. Composes the existing `core.students` /
 * `core.teachers` / `core.parents`-gated list use cases so the plan gate has
 * one home each; a plan missing one of the three simply contributes no
 * results for that entity kind rather than failing the whole search. Results
 * are tagged with their entity kind, merged, sorted alphabetically, and
 * capped to the top 20 so the palette stays fast and scannable.
 */
export class SearchPeople {
  constructor(
    private readonly listStudents: ListStudents,
    private readonly listTeachers: ListTeachers,
    private readonly listParents: ListParents,
  ) {}

  async execute(input: SearchPeopleInput): Promise<readonly PersonSearchResult[]> {
    const needle = fold(input.query.trim());
    if (needle === '') return [];

    const [students, teachers, parents] = await Promise.all([
      this.searchStudents(input.centerCode, needle),
      this.searchTeachers(input.centerCode, needle),
      this.searchParents(input.centerCode, needle),
    ]);

    return [...students, ...teachers, ...parents]
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
      .slice(0, RESULT_CAP);
  }

  private async searchStudents(
    centerCode: CenterCode,
    needle: string,
  ): Promise<PersonSearchResult[]> {
    const students = await this.listGated(() =>
      this.listStudents.execute({ centerCode, search: '' }),
    );
    return students
      .filter((student) => matchesName([student.name.fr, student.name.ar], needle))
      .map((entity) => ({ kind: 'student' as const, entity }));
  }

  private async searchTeachers(
    centerCode: CenterCode,
    needle: string,
  ): Promise<PersonSearchResult[]> {
    const teachers = await this.listGated(() =>
      this.listTeachers.execute({ centerCode, scope: 'active', search: '' }),
    );
    return teachers
      .filter((teacher) => matchesName([teacher.name.fr, teacher.name.ar], needle))
      .map((entity) => ({ kind: 'teacher' as const, entity }));
  }

  private async searchParents(
    centerCode: CenterCode,
    needle: string,
  ): Promise<PersonSearchResult[]> {
    const parents = await this.listGated(() =>
      this.listParents.execute({ centerCode, search: '' }),
    );
    return parents
      .filter((parent) => matchesName([parent.name], needle))
      .map((entity) => ({ kind: 'parent' as const, entity }));
  }

  private async listGated<T>(fn: () => Promise<readonly T[]>): Promise<readonly T[]> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PlanFeatureUnavailableError) return [];
      throw error;
    }
  }
}
