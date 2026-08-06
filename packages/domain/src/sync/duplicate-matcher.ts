import { normalizeNameForMatch } from '../policies/natural-key';
import type { Parent, ParentId } from '../entities/parent';
import type { Student } from '../entities/student';
import type { Teacher } from '../entities/teacher';
import type { CenterCode, EntityId } from '../value-objects/ids';
import { toEntityId } from '../value-objects/ids';
import type { DuplicateReason } from './conflicts';

/**
 * Duplicate matching at sync time (SOU-80 §4 / `sync-safe-entities` step 3), run
 * inside the resolve step for every inbound `create` of a people-like entity.
 * Runs in dependency order: parents (E.164 phone anchor), teachers (same phone
 * anchor), then students (normalized name + guardian). Confidence tiers are
 * `exact` → high-confidence match (still a human-confirmed merge via
 * `MergeParents` / `MergeStudents`, SOU-92 — the engine never merges by itself)
 * and `fuzzy` → flag for the popup.
 *
 * The matcher only *detects*: it never writes, never repoints dependents, and
 * never removes a record. Detection keyed on the SAME name normalization the
 * write path stamps (`normalizeNameForMatch`), so diacritic / case / spacing
 * variants collide exactly where the naturalKey would. There is no
 * transliteration or consonant folding: "Mohamed", "Mohammed", and "محمد"
 * remain DISTINCT keys — a shared phone still flags them fuzzy, never exact.
 */

export const PEOPLE_ENTITY_TYPES = ['parents', 'teachers', 'students'] as const;
export type PeopleEntityType = (typeof PEOPLE_ENTITY_TYPES)[number];

/** Narrowing guard for `PEOPLE_ENTITY_TYPES` — type-safe membership check. */
export function isPeopleEntityType(entityType: string): entityType is PeopleEntityType {
  return (PEOPLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}

/** Typed reads the matcher needs — implemented by the local sync store's adapter. */
export type DuplicateMatchSource = {
  findParentsByPhone(centerCode: CenterCode, phone: string): readonly Parent[];
  findTeachersByPhone(centerCode: CenterCode, phone: string): readonly Teacher[];
  /** All live students in the center whose normalized name matches `nameKey`. */
  findStudentsByName(centerCode: CenterCode, nameKey: string): readonly Student[];
};

export type DuplicateMatch = {
  readonly tier: 'exact' | 'fuzzy';
  readonly candidateId: EntityId;
  /** Stable token mapped to a localized reason in the popup. */
  readonly reason: DuplicateReason;
};

/**
 * Normalize a person name for matching whether it is a plain string (Parent)
 * or the bilingual `{ fr, ar }` object (Teacher). A raw `String()` of the
 * object would be `"[object Object]"` on both sides and make every shared-phone
 * teacher an "exact" match — the `shared-phone` fuzzy tier must stay reachable.
 */
function normalizePersonName(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null) {
    const bilingual = raw as { fr?: unknown; ar?: unknown };
    return normalizeNameForMatch(`${String(bilingual.fr ?? '')} ${String(bilingual.ar ?? '')}`);
  }
  return normalizeNameForMatch(String(raw ?? ''));
}

export class DuplicateMatcher {
  constructor(private readonly source: DuplicateMatchSource) {}

  /** Match an inbound people entity against this device's live records. */
  match(input: {
    entityType: string;
    centerCode: CenterCode;
    entity: Readonly<Record<string, unknown>>;
    selfId: EntityId;
  }): readonly DuplicateMatch[] {
    switch (input.entityType) {
      case 'parents':
        return this.matchByPhone(input, 'parents');
      case 'teachers':
        return this.matchByPhone(input, 'teachers');
      case 'students':
        return this.matchStudents(input);
      default:
        return [];
    }
  }

  private matchByPhone(
    input: { centerCode: CenterCode; entity: Readonly<Record<string, unknown>>; selfId: EntityId },
    kind: 'parents' | 'teachers',
  ): readonly DuplicateMatch[] {
    const phone = String(input.entity['phone'] ?? '');
    const name = normalizePersonName(input.entity['name']);
    const find = kind === 'parents'
      ? (c: CenterCode, p: string) => this.source.findParentsByPhone(c, p)
      : (c: CenterCode, p: string) => this.source.findTeachersByPhone(c, p);

    const matches: DuplicateMatch[] = [];
    for (const person of find(input.centerCode, phone)) {
      if (toEntityId(person.id) === input.selfId) continue;
      const sameName = normalizePersonName((person as { name: unknown }).name) === name;
      matches.push(
        sameName
          ? { tier: 'exact', candidateId: toEntityId(person.id), reason: 'same-name-phone' }
          : { tier: 'fuzzy', candidateId: toEntityId(person.id), reason: 'shared-phone' },
      );
    }
    return matches;
  }

  private matchStudents(input: {
    centerCode: CenterCode;
    entity: Readonly<Record<string, unknown>>;
    selfId: EntityId;
  }): readonly DuplicateMatch[] {
    const name = input.entity['name'] as { fr?: unknown; ar?: unknown };
    const nameKey = normalizeNameForMatch(`${String(name?.fr ?? '')} ${String(name?.ar ?? '')}`);
    const birthDate = String(input.entity['birthDate'] ?? '');
    const guardians = (input.entity['guardianIds'] ?? []) as readonly ParentId[];

    const matches: DuplicateMatch[] = [];
    for (const student of this.source.findStudentsByName(input.centerCode, nameKey)) {
      if (toEntityId(student.id) === input.selfId) continue;
      // Records may reach the matcher before every field is populated; guard so
      // a missing link never crashes a whole sync.
      const studentGuardians = student.guardianIds ?? [];
      const sharesGuardian = studentGuardians.some((id) => guardians.includes(id));
      if (sharesGuardian) {
        matches.push({ tier: 'exact', candidateId: toEntityId(student.id), reason: 'shared-guardian' });
      } else if (student.birthDate === birthDate) {
        // Same name + same birth date, different guardians — separated-family case.
        matches.push({ tier: 'fuzzy', candidateId: toEntityId(student.id), reason: 'separated-family' });
      }
      // Same name, different guardians AND birth dates → two real students, no flag.
    }
    return matches;
  }
}
