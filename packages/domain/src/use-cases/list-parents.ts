import type { ParentRepository } from '../ports/parent-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Parent } from '../entities/parent';

export type ListParentsInput = {
  centerCode: CenterCode;
  /** Accent/case-insensitive substring; matches the name or phone. Empty = all. */
  search: string;
};

// Combining diacritical marks occupy U+0300–U+036F; dropping them folds "Farès"
// to "fares". Done by codepoint rather than a regex character class so no
// combining mark ever appears in source (which would trip
// `no-misleading-character-class`). Mirrors `ListStudents`.
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

function matches(parent: Parent, needle: string): boolean {
  if (needle === '') return true;
  return [parent.name, parent.phone].some((field) => fold(field).includes(needle));
}

/**
 * Lists a center's live guardians for the list screen, filtered by a search term
 * over the name and E.164 phone. Gated by `core.parents` (every plan; the guard
 * still has one home). Ordering is alphabetical by name — a stable, locale-
 * agnostic default; the presentation layer may re-sort per active locale.
 */
export class ListParents {
  constructor(
    private readonly parents: ParentRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListParentsInput): Promise<readonly Parent[]> {
    this.plan.require('core.parents');
    const needle = fold(input.search.trim());
    const active = await this.parents.listActive(input.centerCode);
    return [...active]
      .filter((parent) => matches(parent, needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
