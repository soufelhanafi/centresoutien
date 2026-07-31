import type { TeacherRepository } from '../ports/teacher-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Teacher } from '../entities/teacher';

/** Which slice of a center's teachers to return: the live list or the archive. */
export type TeacherScope = 'active' | 'archived';

export type ListTeachersInput = {
  centerCode: CenterCode;
  /** `'active'` (default view) or `'archived'` (the restore list). */
  scope: TeacherScope;
  /** Accent/case-insensitive substring; matches the FR or AR name or the phone. Empty = all. */
  search: string;
};

// Combining diacritical marks occupy U+0300–U+036F; dropping them folds "Farès"
// to "fares". Done by codepoint rather than a regex character class so no
// combining mark ever appears in source (which would trip
// `no-misleading-character-class`). Mirrors `ListStudents` / `ListParents`.
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

/** Bare digits of a string — the phone comparison ignores +, spaces, and dashes. */
function foldDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

// Phone is stored E.164 (`+212612345678`), but a Moroccan director searches the
// way they dial — the national `0612…` form. Match the bare digits of the stored
// number AND its `0`-prefixed national variant, so either shape a user types hits.
function matchesPhone(phone: string, needleDigits: string): boolean {
  if (needleDigits === '') return false;
  const e164 = foldDigits(phone); // 212612345678
  const national = e164.replace(/^212/, '0'); // 0612345678
  return e164.includes(needleDigits) || national.includes(needleDigits);
}

function matches(teacher: Teacher, needle: string, needleDigits: string): boolean {
  if (needle === '') return true;
  return (
    fold(teacher.name.fr).includes(needle) ||
    fold(teacher.name.ar).includes(needle) ||
    matchesPhone(teacher.phone, needleDigits)
  );
}

/**
 * Lists a center's teachers for the list screen, filtered by a search term over
 * the FR/AR name and E.164 phone. Gated by `core.teachers` (every plan; the guard
 * still has one home). `scope` selects the live teachers or the archived
 * (tombstoned) ones, so a single use case backs both the main list and the restore
 * view (mirrors `ListRooms`). Ordering is alphabetical by French name — a stable,
 * locale-agnostic default; the presentation layer may re-sort per active locale.
 */
export class ListTeachers {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListTeachersInput): Promise<readonly Teacher[]> {
    this.plan.require('core.teachers');
    const needle = fold(input.search.trim());
    const needleDigits = foldDigits(input.search);
    const teachers =
      input.scope === 'archived'
        ? await this.teachers.listArchived(input.centerCode)
        : await this.teachers.listActive(input.centerCode);
    return [...teachers]
      .filter((teacher) => matches(teacher, needle, needleDigits))
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }
}
