import type { StudentRepository } from '../ports/student-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Student } from '../entities/student';

export type ListStudentsInput = {
  centerCode: CenterCode;
  /** Accent/case-insensitive substring; matches FR or AR name or the level. Empty = all. */
  search: string;
};

// Combining diacritical marks occupy U+0300–U+036F; dropping them folds "École" to
// "ecole". Done by codepoint rather than a regex character class so no combining
// mark ever appears in source (which would trip `no-misleading-character-class`).
const COMBINING_LO = 0x300;
const COMBINING_HI = 0x36f;

function isCombiningMark(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= COMBINING_LO && code <= COMBINING_HI;
}

/** Fold accents + case for search comparison (same rule the UI applied on mock data). */
function fold(value: string): string {
  return [...value.normalize('NFKD')]
    .filter((ch) => !isCombiningMark(ch))
    .join('')
    .toLowerCase();
}

function matches(student: Student, needle: string): boolean {
  if (needle === '') return true;
  return [student.name.fr, student.name.ar, student.level].some((field) =>
    fold(field).includes(needle),
  );
}

/**
 * Lists a center's live students for the list screen, filtered by a search term
 * over the FR/AR name and level. Gated by `core.students` (every plan; the guard
 * still has one home). Ordering is alphabetical by French name — a stable,
 * locale-agnostic default; the presentation layer may re-sort per active locale.
 */
export class ListStudents {
  constructor(
    private readonly students: StudentRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListStudentsInput): Promise<readonly Student[]> {
    this.plan.require('core.students');
    const needle = fold(input.search.trim());
    const active = await this.students.listActive(input.centerCode);
    return [...active]
      .filter((student) => matches(student, needle))
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }
}
